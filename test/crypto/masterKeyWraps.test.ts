///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import "reflect-metadata";
import * as x509 from "@peculiar/x509";
import { describe, expect, it } from "vitest";
import { ESCROW_KDF_LABEL, RECOVERY_CODE_COUNT, buildEscrowWrap, buildPasswordWrap, buildRecoveryWraps } from "../../src/crypto/masterKeyWraps.js";
import { fromBase64 } from "../../src/crypto/encoding.js";
import { buildAad, generateMasterKey, openWithKey } from "../../src/crypto/masterKey.js";
import { MASTER_KEY_AAD_PURPOSE } from "../../src/crypto/keySession.js";
import { deriveFromPassword } from "../../src/crypto/passwordUnlock.js";
import { deriveFromRecoveryCode } from "../../src/crypto/recoveryCode.js";
import { decryptEnvelopedData } from "../../src/crypto/smime.js";

x509.cryptoProvider.set(crypto);

const MAILBOX_UID = "mb1";
// Argon2id is intentionally slow (memory-hard) - use lighter parameters than the real default so this
// suite stays fast, while still exercising the real hash-wasm computation end to end (same convention
// as passwordUnlock.test.ts).
const FAST_PARAMS = { memorySize: 8, iterations: 1, parallelism: 1 };

describe("buildPasswordWrap", () => {
    it("produces a wrap that unwraps back to the same MK with the same password", async () => {
        const mk = generateMasterKey();
        const wrap = await buildPasswordWrap(MAILBOX_UID, mk, "a good password", FAST_PARAMS);

        const { wrappingKey } = await deriveFromPassword("a good password", fromBase64(wrap.salt), FAST_PARAMS);
        const opened = await openWithKey(wrappingKey, { ciphertext: wrap.ciphertext, nonce: wrap.nonce }, buildAad(MAILBOX_UID, MASTER_KEY_AAD_PURPOSE));
        expect(opened).toEqual(mk);
    });

    it("fails to unwrap with the wrong password", async () => {
        const mk = generateMasterKey();
        const wrap = await buildPasswordWrap(MAILBOX_UID, mk, "a good password", FAST_PARAMS);

        const { wrappingKey } = await deriveFromPassword("the wrong password", fromBase64(wrap.salt), FAST_PARAMS);
        await expect(
            openWithKey(wrappingKey, { ciphertext: wrap.ciphertext, nonce: wrap.nonce }, buildAad(MAILBOX_UID, MASTER_KEY_AAD_PURPOSE)),
        ).rejects.toThrow();
    });

    it("uses a fresh random salt each call", async () => {
        const mk = generateMasterKey();
        const a = await buildPasswordWrap(MAILBOX_UID, mk, "same password", FAST_PARAMS);
        const b = await buildPasswordWrap(MAILBOX_UID, mk, "same password", FAST_PARAMS);
        expect(a.salt).not.toBe(b.salt);
    });

    it("defaults to this module's recommended Argon2id parameters when none are given", async () => {
        const mk = generateMasterKey();
        const wrap = await buildPasswordWrap(MAILBOX_UID, mk, "a good password");
        expect(wrap.kdf).toBe("argon2id:m=65536,t=3,p=4");
    });
});

describe("buildRecoveryWraps", () => {
    it("defaults to 8 distinct codes, each unwrapping back to the same MK", async () => {
        const mk = generateMasterKey();
        const { wraps, codes } = await buildRecoveryWraps(MAILBOX_UID, mk);

        expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
        expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
        expect(wraps).toHaveLength(RECOVERY_CODE_COUNT);

        for (let i = 0; i < wraps.length; i++) {
            const wrappingKey = await deriveFromRecoveryCode(codes[i], fromBase64(wraps[i].salt));
            const opened = await openWithKey(
                wrappingKey,
                { ciphertext: wraps[i].ciphertext, nonce: wraps[i].nonce },
                buildAad(MAILBOX_UID, MASTER_KEY_AAD_PURPOSE),
            );
            expect(opened).toEqual(mk);
        }
    });

    it("assigns sequence-based methodIds, not derived from the code itself", async () => {
        const mk = generateMasterKey();
        const { wraps } = await buildRecoveryWraps(MAILBOX_UID, mk, 3);
        expect(wraps.map((w) => w.methodId)).toEqual(["recovery-1", "recovery-2", "recovery-3"]);
    });

    it("respects a custom count", async () => {
        const mk = generateMasterKey();
        const { wraps, codes } = await buildRecoveryWraps(MAILBOX_UID, mk, 2);
        expect(wraps).toHaveLength(2);
        expect(codes).toHaveLength(2);
    });
});

async function generateEscrowScopeIdentity(): Promise<{ certDer: Uint8Array; privateKey: CryptoKey }> {
    const keys = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const cert = await x509.X509CertificateGenerator.createSelfSigned({
        serialNumber: "01",
        name: "CN=Escrow Scope",
        notBefore: new Date(),
        notAfter: new Date(Date.now() + 86_400_000),
        signingAlgorithm: { name: "ECDSA", hash: "SHA-256" },
        keys,
    });
    // Same re-import-under-ECDH technique smime.test.ts's own generateTestIdentity() uses for its
    // "encrypt" identities - a holder's own offline tooling would do the same to unwrap this.
    const pkcs8 = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
    const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    return { certDer: new Uint8Array(cert.rawData), privateKey };
}

describe("buildEscrowWrap", () => {
    it("produces a wrap a holder can unwrap back to the same MK using the scope's own certificate/private key", async () => {
        const mk = generateMasterKey();
        const scope = await generateEscrowScopeIdentity();

        const wrap = await buildEscrowWrap(mk, "scope-1", scope.certDer);

        expect(wrap.method).toBe("escrow");
        expect(wrap.escrowScopeId).toBe("scope-1");
        expect(wrap.kdf).toBe(ESCROW_KDF_LABEL);

        const opened = await decryptEnvelopedData(fromBase64(wrap.ciphertext), scope.certDer, scope.privateKey);
        expect(opened).toEqual(mk);
    });

    it("cannot be unwrapped with a different scope's certificate/private key", async () => {
        const mk = generateMasterKey();
        const scope = await generateEscrowScopeIdentity();
        const otherScope = await generateEscrowScopeIdentity();

        const wrap = await buildEscrowWrap(mk, "scope-1", scope.certDer);

        await expect(decryptEnvelopedData(fromBase64(wrap.ciphertext), otherScope.certDer, otherScope.privateKey)).rejects.toThrow();
    });
});
