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
import { type KeyVault, type PublicKey, findActivePublicKey, getKeyVault } from "./keyvaultApi.js";
import { fromBase64 } from "./encoding.js";
import { importPrivateKeyPkcs8 } from "./keys.js";
import { buildAad, openWithKey } from "./masterKey.js";
import { deriveFromPassword, parseArgon2idKdfLabel } from "./passwordUnlock.js";

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

/** What changed in the session store — passed to every `subscribeKeySession()` listener. */
export interface KeySessionEvent {
    mailboxUid: string;
    /** `"unlocked"` when keys were stored (a first unlock, or a re-unlock replacing existing keys, e.g.
     * after a key rotation); `"locked"` when they were destroyed. */
    state: "unlocked" | "locked";
}

export type KeySessionListener = (event: KeySessionEvent) => void;

const listeners = new Set<KeySessionListener>();

function notify(event: KeySessionEvent): void {
    // Iterate a snapshot so a listener that unsubscribes (or subscribes another) mid-dispatch can't skip
    // or double-deliver. A throwing listener must never stop the rest - especially on "locked", where a
    // later listener may be the one clearing decrypted content from the screen - so its error is
    // rethrown asynchronously instead, still surfacing as an uncaught error without aborting delivery.
    for (const listener of [...listeners]) {
        try {
            listener(event);
        } catch (err) {
            queueMicrotask(() => {
                throw err;
            });
        }
    }
}

/**
 * Subscribes to session store changes: fires once per mailbox whenever its keys are unlocked (stored)
 * or destroyed, so a UI can e.g. clear already-decrypted content the moment keys go away instead of
 * polling `getUnlockedKeys()`. A `destroyUnlockedKeys()` call that finds nothing to destroy fires
 * nothing. Returns an unsubscribe function.
 */
export function subscribeKeySession(listener: KeySessionListener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Reads back a mailbox's already-unlocked keys this session, or `undefined` if it hasn't been
 * unlocked yet (or was destroyed). Never triggers an unlock itself. */
export function getUnlockedKeys(mailboxUid: string): UnlockedKeys | undefined {
    return sessions.get(mailboxUid);
}

/**
 * Destroys one mailbox's unlocked keys, or every mailbox's if called with no argument — the spec's
 * "destroyed on explicit logout" / "session revocation" / "configurable idle period" triggers.
 *
 * The master key's bytes are overwritten with zeros in place before the entry is dropped, so any
 * `UnlockedKeys` object a caller is still holding no longer carries usable key material either (and the
 * bytes don't linger until garbage collection). The private keys themselves are `CryptoKey` handles
 * whose material WebCrypto never exposes to JS, so there is nothing to zero there.
 */
export function destroyUnlockedKeys(mailboxUid?: string): void {
    const uids = mailboxUid ? [mailboxUid] : [...sessions.keys()];
    for (const uid of uids) {
        const unlocked = sessions.get(uid);
        if (!unlocked) {
            continue;
        }
        unlocked.masterKey.fill(0);
        sessions.delete(uid);
        notify({ mailboxUid: uid, state: "locked" });
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

    // The unwrapped private keys are imported *extractable* (unlike `importPrivateKeyPkcs8()`'s default)
    // for exactly one consumer: `keyRotation.ts`'s `rewrapPrivateKeysUnderNewMasterKey()`, which re-seals
    // these session keys' PKCS#8 bytes under a new master key via `crypto.subtle.exportKey()` (web-client's
    // Settings > Encryption "rotate keys"). Nothing else exports them. Making them non-extractable would
    // first require that function to re-open the vault's wraps with `masterKey` instead. The transient
    // PKCS#8 plaintext buffers are zeroed as soon as WebCrypto has copied them into a `CryptoKey`.
    try {
        const signingPublicKey = findActivePublicKey(mailboxKeys, "sign");
        const wrappedSigningKey = signingPublicKey && findWrappedPrivateKey(vault, signingPublicKey.fingerprint);
        if (signingPublicKey && wrappedSigningKey) {
            const raw = await openWithKey(masterKey, wrappedSigningKey, buildAad(mailboxUid, SIGNING_PRIVATE_KEY_AAD_PURPOSE));
            unlocked.signingPrivateKey = await importPrivateKeyPkcs8(raw, { name: "ECDSA", namedCurve: "P-256" }, ["sign"], true);
            raw.fill(0);
            unlocked.signingCertDer = fromBase64(signingPublicKey.publicKey);
            unlocked.signingFingerprint = signingPublicKey.fingerprint;
        }

        const encryptionPublicKey = findActivePublicKey(mailboxKeys, "encrypt");
        const wrappedEncryptionKey = encryptionPublicKey && findWrappedPrivateKey(vault, encryptionPublicKey.fingerprint);
        if (encryptionPublicKey && wrappedEncryptionKey) {
            const raw = await openWithKey(masterKey, wrappedEncryptionKey, buildAad(mailboxUid, ENCRYPTION_PRIVATE_KEY_AAD_PURPOSE));
            unlocked.encryptionPrivateKey = await importPrivateKeyPkcs8(raw, { name: "ECDH", namedCurve: "P-256" }, ["deriveBits"], true);
            raw.fill(0);
            unlocked.encryptionCertDer = fromBase64(encryptionPublicKey.publicKey);
            unlocked.encryptionFingerprint = encryptionPublicKey.fingerprint;
        }
    } catch (err) {
        // A failed unlock never reaches the session store, so nothing else would ever zero this.
        masterKey.fill(0);
        throw err;
    }

    // A re-unlock replacing existing keys (e.g. `settings/encryption`'s post-rotation refresh) deliberately
    // does NOT zero the previous entry's master key: an in-flight consumer that captured the old
    // `UnlockedKeys` object (e.g. a local-index build pass) is still legitimately using it, and nothing
    // "destroyed" the session - only `destroyUnlockedKeys()` does that.
    sessions.set(mailboxUid, unlocked);
    notify({ mailboxUid, state: "unlocked" });
}
