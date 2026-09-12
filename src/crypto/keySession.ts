///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * The in-memory session key store `specs/end-to-end_encryption.md`'s "Keypair Generation & Storage"
 * requires: "When a user logs in ... the private keys MUST be downloaded from the server, decrypted,
 * and stored locally on the device in a secure location. When the user explicitly logs out ..., the
 * private keys MUST be destroyed." This module is that store — a plain module-level `Map`, deliberately
 * never `localStorage`/IndexedDB (a page reload or new tab correctly starts with no unlocked keys,
 * requiring the unlock credential again, matching "destroyed on explicit logout" while never
 * persisting unwrapped key material anywhere durable).
 *
 * `KeyEnrollmentGate` (in `web-client`) is what actually prompts for the unlock credential and calls
 * `unlockWithPassword()` below, once per mailbox per session, before rendering the mailbox's real
 * content — see that component's own doc comment.
 *
 * **Password is the only unlock method implemented so far.** Passkey (`passkeyUnlock.ts`) and recovery
 * code (`recoveryCode.ts`) derivation already exist and could unwrap the same `MasterKeyWrap` shape,
 * but no UI calls them yet — a real follow-up, not a silent gap: a mailbox enrolled *only* with a
 * passkey has no way to unlock through this module today.
 */
import type { KeyVault, PublicKey } from "./keyvaultApi.js";
import { findActivePublicKey, getKeyVault } from "./keyvaultApi.js";
import { fromBase64 } from "./encoding.js";
import { importPrivateKeyPkcs8 } from "./keys.js";
import { buildAad, openWithKey } from "./masterKey.js";
import { parseArgon2idKdfLabel } from "./passwordUnlock.js";
import { deriveFromPassword } from "./passwordUnlock.js";

/** AAD purpose labels — MUST exactly match what `KeyEnrollmentGate.tsx` used when it originally
 * sealed each of these values, or `openWithKey()` fails (GCM authenticates the AAD, not just the
 * ciphertext). Centralized here as the one place both wrapping and unwrapping refer to. */
export const MASTER_KEY_AAD_PURPOSE = "master-key";
export const SIGNING_PRIVATE_KEY_AAD_PURPOSE = "sign-private-key";
export const ENCRYPTION_PRIVATE_KEY_AAD_PURPOSE = "encrypt-private-key";

export interface UnlockedKeys {
    masterKey: Uint8Array;
    signingPrivateKey?: CryptoKey;
    signingCertDer?: Uint8Array;
    signingFingerprint?: string;
    encryptionPrivateKey?: CryptoKey;
    encryptionCertDer?: Uint8Array;
    encryptionFingerprint?: string;
}

const sessions = new Map<string, UnlockedKeys>();

/** Reads back a mailbox's already-unlocked keys this session, or `undefined` if it hasn't been
 * unlocked yet (or was destroyed). Never triggers an unlock itself. */
export function getUnlockedKeys(mailboxUid: string): UnlockedKeys | undefined {
    return sessions.get(mailboxUid);
}

/** Destroys one mailbox's unlocked keys, or every mailbox's if called with no argument — the spec's
 * "destroyed on explicit logout" / "session revocation" / "configurable idle period" triggers. */
export function destroyUnlockedKeys(mailboxUid?: string): void {
    if (mailboxUid) {
        sessions.delete(mailboxUid);
    } else {
        sessions.clear();
    }
}

/** Finds the wrapped private key whose fingerprint matches a given published public key. */
function findWrappedPrivateKey(vault: KeyVault, fingerprint: string) {
    return vault.wrappedKeys.find((k) => k.fingerprint === fingerprint);
}

/**
 * Unlocks a mailbox's key vault with its password unlock method: fetches the vault, derives the
 * wrapping key from `password` using the *exact* KDF parameters that wrap was created with, unwraps
 * the master key, then unwraps and imports whichever signing/encryption private keys the mailbox has
 * currently-active public keys for. Stores the result in this module's in-memory session store.
 *
 * Throws (never silently no-ops) when there's no password wrap enrolled, or when the password is
 * wrong (AEAD authentication failure) — callers should present this as "incorrect password," not a
 * generic error, but this module doesn't presume a specific UI's error copy.
 */
export async function unlockWithPassword(mailboxUid: string, mailboxKeys: PublicKey[], password: string): Promise<void> {
    const vault = await getKeyVault(mailboxUid);
    const passwordWrap = vault.masterKeyWraps.find((w) => w.method === "password");
    if (!passwordWrap) {
        throw new Error("This mailbox has no password unlock method enrolled.");
    }
    const kdfParams = parseArgon2idKdfLabel(passwordWrap.kdf);
    if (!kdfParams) {
        throw new Error(`Unrecognized KDF for this mailbox's password wrap: ${passwordWrap.kdf}`);
    }

    const salt = fromBase64(passwordWrap.salt);
    const { wrappingKey } = await deriveFromPassword(password, salt, kdfParams);
    const masterKey = await openWithKey(
        wrappingKey,
        { ciphertext: passwordWrap.ciphertext, nonce: passwordWrap.nonce },
        buildAad(mailboxUid, MASTER_KEY_AAD_PURPOSE),
    );

    const unlocked: UnlockedKeys = { masterKey };

    const signingPublicKey = findActivePublicKey(mailboxKeys, "sign");
    const wrappedSigningKey = signingPublicKey && findWrappedPrivateKey(vault, signingPublicKey.fingerprint);
    if (signingPublicKey && wrappedSigningKey) {
        const raw = await openWithKey(masterKey, wrappedSigningKey, buildAad(mailboxUid, SIGNING_PRIVATE_KEY_AAD_PURPOSE));
        unlocked.signingPrivateKey = await importPrivateKeyPkcs8(raw, { name: "ECDSA", namedCurve: "P-256" }, ["sign"]);
        unlocked.signingCertDer = fromBase64(signingPublicKey.publicKey);
        unlocked.signingFingerprint = signingPublicKey.fingerprint;
    }

    const encryptionPublicKey = findActivePublicKey(mailboxKeys, "encrypt");
    const wrappedEncryptionKey = encryptionPublicKey && findWrappedPrivateKey(vault, encryptionPublicKey.fingerprint);
    if (encryptionPublicKey && wrappedEncryptionKey) {
        const raw = await openWithKey(masterKey, wrappedEncryptionKey, buildAad(mailboxUid, ENCRYPTION_PRIVATE_KEY_AAD_PURPOSE));
        unlocked.encryptionPrivateKey = await importPrivateKeyPkcs8(raw, { name: "ECDH", namedCurve: "P-256" }, ["deriveBits"]);
        unlocked.encryptionCertDer = fromBase64(encryptionPublicKey.publicKey);
        unlocked.encryptionFingerprint = encryptionPublicKey.fingerprint;
    }

    sessions.set(mailboxUid, unlocked);
}
