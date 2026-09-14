///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * The client-side half of `keyvaultApi.ts`'s `rekey()` — "the only real revocation mechanism for a
 * captured wrap" (see that function's own doc comment). A rekey doesn't replace a mailbox's signing/
 * encryption *keypairs* (restapi's own `BaseKeyVaultRoute.rekey()` rejects any `keys` entry that isn't
 * byte-identical to what's already enrolled, aside from `revokedAt` — genuinely new key material must
 * go through `enrollKey()`, which alone talks to the CA); it only changes *how* the existing private
 * keys are protected: a brand new master key (MK), with the old one (and every wrap built against it)
 * left permanently unable to unwrap anything useful, even if an attacker later recovers a captured
 * wrap's secret.
 */
import { KeysLockedError, buildAad, generateMasterKey, sealWithKey } from "./masterKey.js";
import { ENCRYPTION_PRIVATE_KEY_AAD_PURPOSE, SIGNING_PRIVATE_KEY_AAD_PURPOSE, UnlockedKeys } from "./keySession.js";
import type { WrappedPrivateKey } from "./keyvaultApi.js";

export interface RewrappedPrivateKeys {
    /** The brand new master key - callers wrap it under whichever unlock methods should survive the
     * rotation (see `masterKeyWraps.ts`) and pass both alongside this module's own `wrappedKeys` to
     * `rekey()`. */
    mk: Uint8Array;
    wrappedKeys: WrappedPrivateKey[];
}

/**
 * Generates a fresh master key and re-wraps whichever of `unlocked`'s already-decrypted private keys
 * exist under it — the same underlying key material (and its published certificate/fingerprint) is
 * reused unchanged, only its protection changes. A mailbox with only an encryption key (signing keys
 * have no real enrolment path yet — see `KeyEnrollmentGate.tsx`'s own doc comment) simply produces one
 * `WrappedPrivateKey`, not two; this function never invents key material `unlocked` doesn't already
 * have decrypted. Throws `KeysLockedError` for an `UnlockedKeys` object that `destroyUnlockedKeys()` has
 * since destroyed (its private keys are gone, so a rotation would silently wrap nothing) - checked on entry
 * and again before returning, so a lock during the export/seal awaits also fails (the new master key is
 * zeroed first).
 */
export async function rewrapPrivateKeysUnderNewMasterKey(mailboxUid: string, unlocked: UnlockedKeys): Promise<RewrappedPrivateKeys> {
    if (unlocked.destroyed) {
        throw new KeysLockedError();
    }
    // Captured before the first await: `destroyUnlockedKeys()` deletes these handles from `unlocked`, so
    // re-reading them after an await would silently skip a key that was present when rotation started.
    const { signingPrivateKey, signingFingerprint, encryptionPrivateKey, encryptionFingerprint } = unlocked;
    const mk = generateMasterKey();
    const wrappedKeys: WrappedPrivateKey[] = [];

    if (signingPrivateKey && signingFingerprint) {
        const raw = new Uint8Array(await crypto.subtle.exportKey("pkcs8", signingPrivateKey));
        const sealed = await sealWithKey(mk, raw, buildAad(mailboxUid, SIGNING_PRIVATE_KEY_AAD_PURPOSE));
        raw.fill(0);
        wrappedKeys.push({
            ciphertext: sealed.ciphertext,
            nonce: sealed.nonce,
            algorithm: "AES-256-GCM",
            fingerprint: signingFingerprint,
            useType: "sign",
        });
    }

    if (encryptionPrivateKey && encryptionFingerprint) {
        const raw = new Uint8Array(await crypto.subtle.exportKey("pkcs8", encryptionPrivateKey));
        const sealed = await sealWithKey(mk, raw, buildAad(mailboxUid, ENCRYPTION_PRIVATE_KEY_AAD_PURPOSE));
        raw.fill(0);
        wrappedKeys.push({
            ciphertext: sealed.ciphertext,
            nonce: sealed.nonce,
            algorithm: "AES-256-GCM",
            fingerprint: encryptionFingerprint,
            useType: "encrypt",
        });
    }

    if (unlocked.destroyed) {
        // Locked mid-rotation: don't hand back a new master key wrapping keys the user just locked away.
        mk.fill(0);
        throw new KeysLockedError();
    }
    return { mk, wrappedKeys };
}
