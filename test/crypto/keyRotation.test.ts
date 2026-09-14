///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { toBase64 } from "../../src/crypto/encoding.js";
import { generateKeyPairWithCsr, exportPrivateKeyPkcs8 } from "../../src/crypto/keys.js";
import {
    ENCRYPTION_PRIVATE_KEY_AAD_PURPOSE,
    MASTER_KEY_AAD_PURPOSE,
    SIGNING_PRIVATE_KEY_AAD_PURPOSE,
    destroyUnlockedKeys,
    getUnlockedKeys,
    unlockWithPassword,
} from "../../src/crypto/keySession.js";
import { rewrapPrivateKeysUnderNewMasterKey } from "../../src/crypto/keyRotation.js";
import { buildAad, generateMasterKey, openWithKey, sealWithKey } from "../../src/crypto/masterKey.js";
import { argon2idKdfLabel, deriveFromPassword, generateSalt } from "../../src/crypto/passwordUnlock.js";
import type { KeyVault, MasterKeyWrap, PublicKey } from "../../src/crypto/keyvaultApi.js";

const { getKeyVault } = vi.hoisted(() => ({ getKeyVault: vi.fn() }));
vi.mock("../../src/crypto/keyvaultApi.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../src/crypto/keyvaultApi.js")>()),
    getKeyVault,
}));

const FAST_PARAMS = { memorySize: 8, iterations: 1, parallelism: 1 };
const MAILBOX_UID = "mb1";
const PASSWORD = "a fine password";

// Mirrors keySession.test.ts's own enrollForTest() helper exactly, so this suite proves
// rewrapPrivateKeysUnderNewMasterKey() is genuinely compatible with what a real unlock produces, not
// just internally self-consistent with its own assumptions.
async function enrollForTest(
    useTypes: ("sign" | "encrypt")[],
): Promise<{ vault: KeyVault; mailboxKeys: PublicKey[]; rawPrivateKeys: Record<string, Uint8Array> }> {
    const mk = generateMasterKey();
    const mkAad = buildAad(MAILBOX_UID, MASTER_KEY_AAD_PURPOSE);
    const salt = generateSalt();
    const { wrappingKey } = await deriveFromPassword(PASSWORD, salt, FAST_PARAMS);
    const sealed = await sealWithKey(wrappingKey, mk, mkAad);
    const passwordWrap: MasterKeyWrap = {
        method: "password",
        ciphertext: sealed.ciphertext,
        nonce: sealed.nonce,
        salt: toBase64(salt),
        kdf: argon2idKdfLabel(FAST_PARAMS),
        schemeVersion: 1,
        createdAt: Date.now(),
    };

    const mailboxKeys: PublicKey[] = [];
    const wrappedKeys: KeyVault["wrappedKeys"] = [];
    const rawPrivateKeys: Record<string, Uint8Array> = {};
    for (const useType of useTypes) {
        const { keyPair } = await generateKeyPairWithCsr("alice@example.com", useType);
        const privateRaw = await exportPrivateKeyPkcs8(keyPair.privateKey);
        rawPrivateKeys[useType] = privateRaw;
        const purpose = useType === "sign" ? SIGNING_PRIVATE_KEY_AAD_PURPOSE : ENCRYPTION_PRIVATE_KEY_AAD_PURPOSE;
        const sealedPriv = await sealWithKey(mk, privateRaw, buildAad(MAILBOX_UID, purpose));
        const fingerprint = `fp-${useType}`;
        mailboxKeys.push({
            publicKey: toBase64(new Uint8Array([1, 2, 3])),
            type: "x509",
            useType,
            fingerprint,
            notBefore: Date.now() - 1000,
            notAfter: Date.now() + 1_000_000,
        });
        wrappedKeys.push({ ciphertext: sealedPriv.ciphertext, nonce: sealedPriv.nonce, algorithm: "AES-256-GCM", fingerprint, useType });
    }

    return { vault: { wrappedKeys, masterKeyWraps: [passwordWrap] }, mailboxKeys, rawPrivateKeys };
}

afterEach(() => {
    destroyUnlockedKeys();
    vi.clearAllMocks();
});

describe("rewrapPrivateKeysUnderNewMasterKey", () => {
    it("produces a wrapped encryption key that unwraps under the new MK to the same raw key material", async () => {
        const { vault, mailboxKeys, rawPrivateKeys } = await enrollForTest(["encrypt"]);
        getKeyVault.mockResolvedValue(vault);
        await unlockWithPassword(MAILBOX_UID, mailboxKeys, PASSWORD);
        const unlocked = getUnlockedKeys(MAILBOX_UID)!;

        const { mk, wrappedKeys } = await rewrapPrivateKeysUnderNewMasterKey(MAILBOX_UID, unlocked);

        expect(wrappedKeys).toHaveLength(1);
        expect(wrappedKeys[0].useType).toBe("encrypt");
        expect(wrappedKeys[0].fingerprint).toBe("fp-encrypt");
        const reopened = await openWithKey(mk, wrappedKeys[0], buildAad(MAILBOX_UID, ENCRYPTION_PRIVATE_KEY_AAD_PURPOSE));
        expect(reopened).toEqual(rawPrivateKeys.encrypt);
    });

    it("produces wrapped entries for both a signing and an encryption key when both are unlocked", async () => {
        const { vault, mailboxKeys, rawPrivateKeys } = await enrollForTest(["sign", "encrypt"]);
        getKeyVault.mockResolvedValue(vault);
        await unlockWithPassword(MAILBOX_UID, mailboxKeys, PASSWORD);
        const unlocked = getUnlockedKeys(MAILBOX_UID)!;

        const { mk, wrappedKeys } = await rewrapPrivateKeysUnderNewMasterKey(MAILBOX_UID, unlocked);

        expect(wrappedKeys).toHaveLength(2);
        const signWrap = wrappedKeys.find((k) => k.useType === "sign")!;
        const encryptWrap = wrappedKeys.find((k) => k.useType === "encrypt")!;
        expect(await openWithKey(mk, signWrap, buildAad(MAILBOX_UID, SIGNING_PRIVATE_KEY_AAD_PURPOSE))).toEqual(rawPrivateKeys.sign);
        expect(await openWithKey(mk, encryptWrap, buildAad(MAILBOX_UID, ENCRYPTION_PRIVATE_KEY_AAD_PURPOSE))).toEqual(rawPrivateKeys.encrypt);
    });

    it("throws KeysLockedError for an UnlockedKeys object destroyed since it was read (round-4 review)", async () => {
        const { vault, mailboxKeys } = await enrollForTest(["encrypt"]);
        getKeyVault.mockResolvedValue(vault);
        await unlockWithPassword(MAILBOX_UID, mailboxKeys, PASSWORD);
        const stale = getUnlockedKeys(MAILBOX_UID)!;
        destroyUnlockedKeys(MAILBOX_UID);

        await expect(rewrapPrivateKeysUnderNewMasterKey(MAILBOX_UID, stale)).rejects.toMatchObject({ name: "KeysLockedError" });
    });

    it("throws KeysLockedError and zeroes the new MK when the keys are destroyed mid-rotation (round-5 review)", async () => {
        const { vault, mailboxKeys } = await enrollForTest(["sign", "encrypt"]);
        getKeyVault.mockResolvedValue(vault);
        await unlockWithPassword(MAILBOX_UID, mailboxKeys, PASSWORD);
        const unlocked = getUnlockedKeys(MAILBOX_UID)!;
        const realExport = crypto.subtle.exportKey.bind(crypto.subtle);
        const generated: Uint8Array[] = [];
        const randomSpy = vi.spyOn(crypto, "getRandomValues");
        const exportSpy = vi.spyOn(crypto.subtle, "exportKey").mockImplementation(async (format, key) => {
            destroyUnlockedKeys(MAILBOX_UID);
            return realExport(format as "pkcs8", key);
        });

        await expect(rewrapPrivateKeysUnderNewMasterKey(MAILBOX_UID, unlocked)).rejects.toMatchObject({ name: "KeysLockedError" });
        // Both exports still ran on the handles captured up front, and the generated MK was zeroed.
        expect(exportSpy).toHaveBeenCalledTimes(2);
        generated.push(...randomSpy.mock.results.map((r) => r.value as Uint8Array).filter((v) => v.length === 32));
        expect(generated.length).toBeGreaterThan(0);
        expect(generated[0].every((b) => b === 0)).toBe(true);
        exportSpy.mockRestore();
        randomSpy.mockRestore();
    });

    it("produces no wrapped entries when nothing is unlocked", async () => {
        const { mk, wrappedKeys } = await rewrapPrivateKeysUnderNewMasterKey(MAILBOX_UID, { masterKey: new Uint8Array(32) });
        expect(wrappedKeys).toEqual([]);
        expect(mk).toHaveLength(32);
    });

    it("generates a fresh, different MK from the one that was unlocked", async () => {
        const { vault, mailboxKeys } = await enrollForTest(["encrypt"]);
        getKeyVault.mockResolvedValue(vault);
        await unlockWithPassword(MAILBOX_UID, mailboxKeys, PASSWORD);
        const unlocked = getUnlockedKeys(MAILBOX_UID)!;

        const { mk } = await rewrapPrivateKeysUnderNewMasterKey(MAILBOX_UID, unlocked);
        expect(toBase64(mk)).not.toBe(toBase64(unlocked.masterKey));
    });
});
