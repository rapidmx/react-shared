///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { toBase64 } from "../../src/crypto/encoding.js";
import { generateKeyPairWithCsr, exportPrivateKeyPkcs8 } from "../../src/crypto/keys.js";
import {
    type KeySessionEvent,
    ENCRYPTION_PRIVATE_KEY_AAD_PURPOSE,
    MASTER_KEY_AAD_PURPOSE,
    SIGNING_PRIVATE_KEY_AAD_PURPOSE,
    destroyUnlockedKeys,
    getUnlockedKeys,
    subscribeKeySession,
    unlockWithPassword,
} from "../../src/crypto/keySession.js";
import { buildAad, generateMasterKey, sealWithKey } from "../../src/crypto/masterKey.js";
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

/** Builds a real KeyVault + Mailbox.keys pair the way KeyEnrollmentGate's own enrollment flow does,
 * so this test proves unlockWithPassword() is genuinely compatible with what enrollment produces —
 * not just internally self-consistent with its own assumptions about wrap format. */
async function enrollForTest(
    useTypes: ("sign" | "encrypt")[],
    mailboxUid: string = MAILBOX_UID,
): Promise<{ vault: KeyVault; mailboxKeys: PublicKey[] }> {
    const mk = generateMasterKey();
    const mkAad = buildAad(mailboxUid, MASTER_KEY_AAD_PURPOSE);
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
    for (const useType of useTypes) {
        const { keyPair } = await generateKeyPairWithCsr("alice@example.com", useType);
        const privateRaw = await exportPrivateKeyPkcs8(keyPair.privateKey);
        const purpose = useType === "sign" ? SIGNING_PRIVATE_KEY_AAD_PURPOSE : ENCRYPTION_PRIVATE_KEY_AAD_PURPOSE;
        const sealedPriv = await sealWithKey(mk, privateRaw, buildAad(mailboxUid, purpose));
        const fingerprint = `fp-${useType}`;
        mailboxKeys.push({
            publicKey: toBase64(new Uint8Array([1, 2, 3])), // placeholder DER - not exercised by unlock itself
            type: "x509",
            useType,
            fingerprint,
            notBefore: Date.now() - 1000,
            notAfter: Date.now() + 1_000_000,
        });
        wrappedKeys.push({ ciphertext: sealedPriv.ciphertext, nonce: sealedPriv.nonce, algorithm: "AES-256-GCM", fingerprint, useType });
    }

    return { vault: { wrappedKeys, masterKeyWraps: [passwordWrap] }, mailboxKeys };
}

afterEach(() => {
    destroyUnlockedKeys();
    vi.clearAllMocks();
});

describe("unlockWithPassword", () => {
    it("unlocks the master key and the encryption private key for a real (encrypt-only) enrollment", async () => {
        const { vault, mailboxKeys } = await enrollForTest(["encrypt"]);
        getKeyVault.mockResolvedValue(vault);

        await unlockWithPassword(MAILBOX_UID, mailboxKeys, PASSWORD);

        const unlocked = getUnlockedKeys(MAILBOX_UID);
        expect(unlocked).toBeDefined();
        expect(unlocked!.masterKey.length).toBe(32);
        expect(unlocked!.encryptionPrivateKey).toBeDefined();
        expect(unlocked!.encryptionPrivateKey!.algorithm.name).toBe("ECDH");
        expect(unlocked!.encryptionFingerprint).toBe("fp-encrypt");
        expect(unlocked!.signingPrivateKey).toBeUndefined();
    });

    it("also unlocks a signing key when one is enrolled", async () => {
        const { vault, mailboxKeys } = await enrollForTest(["sign", "encrypt"]);
        getKeyVault.mockResolvedValue(vault);

        await unlockWithPassword(MAILBOX_UID, mailboxKeys, PASSWORD);

        const unlocked = getUnlockedKeys(MAILBOX_UID)!;
        expect(unlocked.signingPrivateKey).toBeDefined();
        expect(unlocked.signingPrivateKey!.algorithm.name).toBe("ECDSA");
        expect(unlocked.signingFingerprint).toBe("fp-sign");
        expect(unlocked.encryptionPrivateKey).toBeDefined();
    });

    it("throws when no password wrap is enrolled", async () => {
        const { vault } = await enrollForTest(["encrypt"]);
        getKeyVault.mockResolvedValue({ ...vault, masterKeyWraps: [] });

        await expect(unlockWithPassword(MAILBOX_UID, [], PASSWORD)).rejects.toThrow(/no password unlock method/i);
    });

    it("throws with the wrong password (AEAD authentication failure)", async () => {
        const { vault, mailboxKeys } = await enrollForTest(["encrypt"]);
        getKeyVault.mockResolvedValue(vault);

        await expect(unlockWithPassword(MAILBOX_UID, mailboxKeys, "the wrong password")).rejects.toThrow();
        expect(getUnlockedKeys(MAILBOX_UID)).toBeUndefined();
    });

    it("throws for an unrecognized KDF label on the password wrap", async () => {
        const { vault } = await enrollForTest(["encrypt"]);
        const corrupted = { ...vault, masterKeyWraps: [{ ...vault.masterKeyWraps[0], kdf: "some-future-kdf" }] };
        getKeyVault.mockResolvedValue(corrupted);

        await expect(unlockWithPassword(MAILBOX_UID, [], PASSWORD)).rejects.toThrow(/unrecognized kdf/i);
    });

    it("skips a public key with no matching wrapped private key, rather than throwing", async () => {
        const { vault, mailboxKeys } = await enrollForTest(["encrypt"]);
        // A published key with no corresponding vault entry - e.g. published by a different device
        // this one hasn't synced with yet.
        const orphanKey: PublicKey = { ...mailboxKeys[0], fingerprint: "fp-orphan" };
        getKeyVault.mockResolvedValue(vault);

        await unlockWithPassword(MAILBOX_UID, [orphanKey], PASSWORD);
        const unlocked = getUnlockedKeys(MAILBOX_UID)!;
        expect(unlocked.encryptionPrivateKey).toBeUndefined();
        expect(unlocked.masterKey.length).toBe(32);
    });

    it("prefers the most recently issued active key when a mailbox has more than one of the same useType", async () => {
        const { vault, mailboxKeys } = await enrollForTest(["encrypt"]);
        const older: PublicKey = { ...mailboxKeys[0], fingerprint: "fp-older", notBefore: Date.now() - 100_000 };
        getKeyVault.mockResolvedValue(vault);

        await unlockWithPassword(MAILBOX_UID, [older, mailboxKeys[0]], PASSWORD);
        expect(getUnlockedKeys(MAILBOX_UID)!.encryptionFingerprint).toBe("fp-encrypt");
    });

    it("ignores a revoked key even if it would otherwise be the most recent", async () => {
        const { vault, mailboxKeys } = await enrollForTest(["encrypt"]);
        const revoked: PublicKey = { ...mailboxKeys[0], fingerprint: "fp-revoked", notBefore: Date.now(), revokedAt: Date.now() };
        getKeyVault.mockResolvedValue(vault);

        await unlockWithPassword(MAILBOX_UID, [revoked, mailboxKeys[0]], PASSWORD);
        expect(getUnlockedKeys(MAILBOX_UID)!.encryptionFingerprint).toBe("fp-encrypt");
    });

    it("ignores an expired key", async () => {
        const { vault, mailboxKeys } = await enrollForTest(["encrypt"]);
        const expired: PublicKey = { ...mailboxKeys[0], fingerprint: "fp-expired", notBefore: Date.now(), notAfter: Date.now() - 1000 };
        getKeyVault.mockResolvedValue(vault);

        await unlockWithPassword(MAILBOX_UID, [expired, mailboxKeys[0]], PASSWORD);
        expect(getUnlockedKeys(MAILBOX_UID)!.encryptionFingerprint).toBe("fp-encrypt");
    });
});

describe("getUnlockedKeys / destroyUnlockedKeys", () => {
    it("returns undefined for a mailbox that was never unlocked", () => {
        expect(getUnlockedKeys("never-unlocked")).toBeUndefined();
    });

    it("destroys just one mailbox's keys when called with an argument", async () => {
        const a = await enrollForTest(["encrypt"], "mb-a");
        const b = await enrollForTest(["encrypt"], "mb1");
        getKeyVault.mockImplementation((mailboxUid: string) => Promise.resolve(mailboxUid === "mb-a" ? a.vault : b.vault));
        await unlockWithPassword("mb-a", a.mailboxKeys, PASSWORD);
        await unlockWithPassword("mb1", b.mailboxKeys, PASSWORD);

        destroyUnlockedKeys("mb-a");
        expect(getUnlockedKeys("mb-a")).toBeUndefined();
        expect(getUnlockedKeys("mb1")).toBeDefined();
    });

    it("destroys every mailbox's keys when called with no argument", async () => {
        const a = await enrollForTest(["encrypt"], "mb-a");
        const b = await enrollForTest(["encrypt"], "mb1");
        getKeyVault.mockImplementation((mailboxUid: string) => Promise.resolve(mailboxUid === "mb-a" ? a.vault : b.vault));
        await unlockWithPassword("mb-a", a.mailboxKeys, PASSWORD);
        await unlockWithPassword("mb1", b.mailboxKeys, PASSWORD);

        destroyUnlockedKeys();
        expect(getUnlockedKeys("mb-a")).toBeUndefined();
        expect(getUnlockedKeys("mb1")).toBeUndefined();
    });

    it("zeroes the master key bytes in place when keys are destroyed", async () => {
        const { vault, mailboxKeys } = await enrollForTest(["encrypt"]);
        getKeyVault.mockResolvedValue(vault);
        await unlockWithPassword(MAILBOX_UID, mailboxKeys, PASSWORD);
        const held = getUnlockedKeys(MAILBOX_UID)!;
        expect(held.masterKey.some((b) => b !== 0)).toBe(true);

        destroyUnlockedKeys(MAILBOX_UID);
        expect(held.masterKey.length).toBe(32);
        expect(held.masterKey.every((b) => b === 0)).toBe(true);
    });

    it("zeroes every mailbox's master key on a destroy-all", async () => {
        const a = await enrollForTest(["encrypt"], "mb-a");
        const b = await enrollForTest(["encrypt"], "mb1");
        getKeyVault.mockImplementation((mailboxUid: string) => Promise.resolve(mailboxUid === "mb-a" ? a.vault : b.vault));
        await unlockWithPassword("mb-a", a.mailboxKeys, PASSWORD);
        await unlockWithPassword("mb1", b.mailboxKeys, PASSWORD);
        const heldA = getUnlockedKeys("mb-a")!;
        const heldB = getUnlockedKeys("mb1")!;

        destroyUnlockedKeys();
        expect(heldA.masterKey.every((x) => x === 0)).toBe(true);
        expect(heldB.masterKey.every((x) => x === 0)).toBe(true);
    });

    it("does not zero the previous master key when a re-unlock replaces a session", async () => {
        const { vault, mailboxKeys } = await enrollForTest(["encrypt"]);
        getKeyVault.mockResolvedValue(vault);
        await unlockWithPassword(MAILBOX_UID, mailboxKeys, PASSWORD);
        const first = getUnlockedKeys(MAILBOX_UID)!;
        await unlockWithPassword(MAILBOX_UID, mailboxKeys, PASSWORD);

        expect(getUnlockedKeys(MAILBOX_UID)).not.toBe(first);
        expect(first.masterKey.some((x) => x !== 0)).toBe(true);
    });

    it("keeps unlocked private keys extractable, since key rotation re-exports them", async () => {
        const { vault, mailboxKeys } = await enrollForTest(["sign", "encrypt"]);
        getKeyVault.mockResolvedValue(vault);
        await unlockWithPassword(MAILBOX_UID, mailboxKeys, PASSWORD);
        const unlocked = getUnlockedKeys(MAILBOX_UID)!;
        expect(unlocked.signingPrivateKey!.extractable).toBe(true);
        expect(unlocked.encryptionPrivateKey!.extractable).toBe(true);
    });

    it("zeroes the unwrapped master key when unwrapping a private key fails partway", async () => {
        const { vault, mailboxKeys } = await enrollForTest(["encrypt"]);
        // A private-key wrap sealed under the right AAD but garbage ciphertext - the master key itself
        // opens fine, then the private key's AEAD check fails.
        const corrupted: KeyVault = {
            ...vault,
            wrappedKeys: [{ ...vault.wrappedKeys[0], ciphertext: toBase64(new Uint8Array(64)) }],
        };
        getKeyVault.mockResolvedValue(corrupted);
        const fills = vi.spyOn(Uint8Array.prototype, "fill");

        await expect(unlockWithPassword(MAILBOX_UID, mailboxKeys, PASSWORD)).rejects.toThrow();
        expect(getUnlockedKeys(MAILBOX_UID)).toBeUndefined();
        const zeroFills = fills.mock.calls
            .map((args, i) => ({ value: args[0], target: fills.mock.contexts[i] as Uint8Array }))
            .filter(({ value, target }) => value === 0 && target.length === 32);
        expect(zeroFills.length).toBe(1);
        expect(zeroFills[0].target.every((x) => x === 0)).toBe(true);
        fills.mockRestore();
    });
});

describe("subscribeKeySession", () => {
    it("notifies on unlock and on destroy, with the mailbox and new state", async () => {
        const { vault, mailboxKeys } = await enrollForTest(["encrypt"]);
        getKeyVault.mockResolvedValue(vault);
        const listener = vi.fn();
        const unsubscribe = subscribeKeySession(listener);

        await unlockWithPassword(MAILBOX_UID, mailboxKeys, PASSWORD);
        expect(listener).toHaveBeenLastCalledWith({ mailboxUid: MAILBOX_UID, state: "unlocked" } satisfies KeySessionEvent);

        destroyUnlockedKeys(MAILBOX_UID);
        expect(listener).toHaveBeenLastCalledWith({ mailboxUid: MAILBOX_UID, state: "locked" });
        expect(listener).toHaveBeenCalledTimes(2);
        unsubscribe();
    });

    it("fires one locked event per mailbox on destroy-all, and nothing when there was nothing to destroy", async () => {
        const a = await enrollForTest(["encrypt"], "mb-a");
        const b = await enrollForTest(["encrypt"], "mb1");
        getKeyVault.mockImplementation((mailboxUid: string) => Promise.resolve(mailboxUid === "mb-a" ? a.vault : b.vault));
        await unlockWithPassword("mb-a", a.mailboxKeys, PASSWORD);
        await unlockWithPassword("mb1", b.mailboxKeys, PASSWORD);

        const listener = vi.fn();
        const unsubscribe = subscribeKeySession(listener);
        destroyUnlockedKeys();
        expect(listener.mock.calls.map(([e]) => e)).toEqual([
            { mailboxUid: "mb-a", state: "locked" },
            { mailboxUid: "mb1", state: "locked" },
        ]);

        listener.mockClear();
        destroyUnlockedKeys();
        destroyUnlockedKeys("never-unlocked");
        expect(listener).not.toHaveBeenCalled();
        unsubscribe();
    });

    it("does not notify on a failed unlock", async () => {
        const { vault, mailboxKeys } = await enrollForTest(["encrypt"]);
        getKeyVault.mockResolvedValue(vault);
        const listener = vi.fn();
        const unsubscribe = subscribeKeySession(listener);

        await expect(unlockWithPassword(MAILBOX_UID, mailboxKeys, "the wrong password")).rejects.toThrow();
        expect(listener).not.toHaveBeenCalled();
        unsubscribe();
    });

    it("stops notifying after unsubscribe, and accepts a zero-argument listener", async () => {
        const { vault, mailboxKeys } = await enrollForTest(["encrypt"]);
        getKeyVault.mockResolvedValue(vault);
        let calls = 0;
        const unsubscribe = subscribeKeySession(() => {
            calls++;
        });
        await unlockWithPassword(MAILBOX_UID, mailboxKeys, PASSWORD);
        expect(calls).toBe(1);

        unsubscribe();
        destroyUnlockedKeys();
        expect(calls).toBe(1);
    });

    it("still delivers to every listener when one throws, surfacing the error asynchronously", async () => {
        const { vault, mailboxKeys } = await enrollForTest(["encrypt"]);
        getKeyVault.mockResolvedValue(vault);
        await unlockWithPassword(MAILBOX_UID, mailboxKeys, PASSWORD);

        const boom = new Error("listener failed");
        const rethrown: unknown[] = [];
        const microtaskSpy = vi.spyOn(globalThis, "queueMicrotask").mockImplementation((cb) => {
            try {
                cb();
            } catch (err) {
                rethrown.push(err);
            }
        });
        const second = vi.fn();
        const unsubA = subscribeKeySession(() => {
            throw boom;
        });
        const unsubB = subscribeKeySession(second);

        destroyUnlockedKeys(MAILBOX_UID);
        expect(second).toHaveBeenCalledWith({ mailboxUid: MAILBOX_UID, state: "locked" });
        expect(getUnlockedKeys(MAILBOX_UID)).toBeUndefined();
        expect(rethrown).toEqual([boom]);

        microtaskSpy.mockRestore();
        unsubA();
        unsubB();
    });
});
