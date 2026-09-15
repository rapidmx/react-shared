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
import { type KeyVault, type PublicKey, type WrappedPrivateKey, findActivePublicKey, getKeyVault } from "./keyvaultApi.js";
import { fromBase64 } from "./encoding.js";
import { importPrivateKeyPkcs8 } from "./keys.js";
import { KeysLockedError, buildAad, openWithKey } from "./masterKey.js";
import { deriveFromPassword, parseArgon2idKdfLabel } from "./passwordUnlock.js";

/** AAD purpose labels — MUST exactly match what `KeyEnrollmentGate.tsx` used when it originally
 * sealed each of these values, or `openWithKey()` fails (GCM authenticates the AAD, not just the
 * ciphertext). Centralized here as the one place both wrapping and unwrapping refer to. */
export const MASTER_KEY_AAD_PURPOSE = "master-key";
export const SIGNING_PRIVATE_KEY_AAD_PURPOSE = "sign-private-key";
export const ENCRYPTION_PRIVATE_KEY_AAD_PURPOSE = "encrypt-private-key";

export { KeysLockedError };

export interface UnlockedKeys {
    /** `true` once `destroyUnlockedKeys()` has destroyed this object's keys (master key zeroed, private key
     * handles dropped). A caller holding an `UnlockedKeys` across an `await` or a user action must treat a
     * destroyed object as locked and re-read `getUnlockedKeys()` instead - `masterKey.ts`'s helpers throw
     * `KeysLockedError` when handed its zeroed master key. Never set on an object still in the store. */
    destroyed?: boolean;
    masterKey: Uint8Array;
    signingPrivateKey?: CryptoKey;
    signingCertDer?: Uint8Array;
    signingFingerprint?: string;
    encryptionPrivateKey?: CryptoKey;
    encryptionCertDer?: Uint8Array;
    encryptionFingerprint?: string;
}

const sessions = new Map<string, UnlockedKeys>();

/** The one method of `WeakRef` this module uses - typed locally because the build's `ES2020` lib predates it. */
interface WeakHandle<T> {
    deref(): T | undefined;
}

/** A weak reference to `target` where the runtime has `WeakRef` (every supported browser and Node), otherwise a
 * strong one - a missing `WeakRef` must never make a lock skip an object. */
function weakHandle<T extends object>(target: T): WeakHandle<T> {
    const WeakRefCtor = (globalThis as { WeakRef?: new (target: T) => WeakHandle<T> }).WeakRef;
    return WeakRefCtor ? new WeakRefCtor(target) : { deref: () => target };
}

/** Every `UnlockedKeys` object this store has handed out per mailbox and not yet destroyed - a re-unlock
 * replaces the store entry but leaves the previous object usable for in-flight consumers, so a lock must
 * reach all of them, not only the newest. Held *weakly*: the current object is kept alive by `sessions`, and a
 * replaced one (e.g. holding a pre-rotation master key) only for as long as some consumer still references it -
 * once nothing does, it can be collected instead of lingering until the next lock. A lock destroys every one
 * still reachable, which is every one anybody could still use. */
const issued = new Map<string, Set<WeakHandle<UnlockedKeys>>>();
/** Bumped by every `destroyUnlockedKeys()` call for that mailbox (`lockAllGeneration` for a destroy-all),
 * so an unlock still awaiting the vault/KDF when a lock happens can tell and discard what it unwrapped. */
const lockGenerations = new Map<string, number>();
let lockAllGeneration = 0;

function lockGeneration(mailboxUid: string): string {
    return `${lockAllGeneration}:${lockGenerations.get(mailboxUid) ?? 0}`;
}

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
 * bytes don't linger until garbage collection). That object is also marked `destroyed: true` and its
 * private key `CryptoKey` handles are removed (their material is never exposed to JS, so there is nothing
 * to zero - but a stale holder must not keep signing/decrypting with them after a lock). Sealing/opening
 * with the zeroed master key throws `KeysLockedError` (see `masterKey.ts`).
 *
 * Every object handed out for the mailbox is destroyed - including ones a re-unlock already replaced in the
 * store - and an `unlockWithPassword()` still in flight for it when this runs throws `KeysLockedError`
 * instead of restoring keys after the lock.
 */
export function destroyUnlockedKeys(mailboxUid?: string): void {
    if (mailboxUid) {
        lockGenerations.set(mailboxUid, (lockGenerations.get(mailboxUid) ?? 0) + 1);
    } else {
        lockAllGeneration++;
    }
    const uids = mailboxUid ? [mailboxUid] : [...issued.keys()];
    for (const uid of uids) {
        const objects = issued.get(uid);
        if (!objects) {
            continue;
        }
        for (const handle of objects) {
            const unlocked = handle.deref();
            if (unlocked) {
                destroyObject(unlocked);
            }
        }
        issued.delete(uid);
        sessions.delete(uid);
        notify({ mailboxUid: uid, state: "locked" });
    }
}

function destroyObject(unlocked: UnlockedKeys): void {
    unlocked.masterKey.fill(0);
    unlocked.destroyed = true;
    delete unlocked.signingPrivateKey;
    delete unlocked.encryptionPrivateKey;
}

/** Finds the wrapped private key whose fingerprint matches a given published public key. */
function findWrappedPrivateKey(vault: KeyVault, fingerprint: string) {
    return vault.wrappedKeys.find((k) => k.fingerprint === fingerprint);
}

/** What `unlockWithPassword()` resolves with. */
export interface UnlockResult {
    /** Fingerprints of active *signing* keys whose wrapped private key couldn't be opened with the (correctly
     * unwrapped) master key - e.g. a wrap sealed under a master key a later rekey replaced. The unlock still
     * succeeds without them (no `signingPrivateKey`), so a user isn't locked out of reading mail by a signing
     * key they can re-enroll. Empty when every active key opened. */
    unopenableKeys: string[];
}

/**
 * Thrown by `unlockWithPassword()` when the password was right (the master key unwrapped) but the active
 * *encryption* key's wrapped private key couldn't be opened or imported with it. Distinct from the
 * wrong-password failure (which rejects with the underlying AEAD error from opening the password wrap), so a
 * UI can say "your encryption key can't be opened" instead of "incorrect password".
 */
export class UnopenableEncryptionKeyError extends Error {
    public readonly fingerprint: string;
    /** The underlying AEAD/import failure. */
    public readonly cause: unknown;

    constructor(fingerprint: string, cause?: unknown) {
        super(`The encryption key ${fingerprint} for this mailbox couldn't be opened with its master key.`);
        this.name = "UnopenableEncryptionKeyError";
        this.fingerprint = fingerprint;
        this.cause = cause;
    }
}

/** Opens one wrapped PKCS#8 private key under `masterKey` and imports it (extractable), zeroing the
 * transient plaintext whether or not the import succeeds. */
async function openPrivateKey(
    masterKey: Uint8Array,
    wrapped: WrappedPrivateKey,
    aad: Uint8Array,
    algorithm: EcKeyImportParams,
    usages: KeyUsage[],
): Promise<CryptoKey> {
    const raw = await openWithKey(masterKey, wrapped, aad);
    try {
        return await importPrivateKeyPkcs8(raw, algorithm, usages, true);
    } finally {
        raw.fill(0);
    }
}

/**
 * Unlocks a mailbox's key vault with its password unlock method: fetches the vault, derives the
 * wrapping key from `password` using the *exact* KDF parameters that wrap was created with, unwraps
 * the master key, then unwraps and imports whichever signing/encryption private keys the mailbox has
 * currently-active public keys for. Stores the result in this module's in-memory session store.
 *
 * Throws (never silently no-ops) when there's no password wrap enrolled, or when the password is
 * wrong (AEAD authentication failure opening the password wrap) — callers should present this as
 * "incorrect password," not a generic error, but this module doesn't presume a specific UI's error copy.
 * Once the master key has opened, the password is known to be right: an active signing key that then
 * won't open is skipped and listed in `UnlockResult.unopenableKeys`; an active encryption key that won't
 * open still fails the unlock, with `UnopenableEncryptionKeyError`. Throws `KeysLockedError` when
 * `destroyUnlockedKeys()` locked this mailbox (or all mailboxes) while the unlock was in flight.
 */
export async function unlockWithPassword(mailboxUid: string, mailboxKeys: PublicKey[], password: string): Promise<UnlockResult> {
    const generation = lockGeneration(mailboxUid);
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
    const unopenableKeys: string[] = [];

    // The unwrapped private keys are imported *extractable* (unlike `importPrivateKeyPkcs8()`'s default)
    // for exactly one consumer: `keyRotation.ts`'s `rewrapPrivateKeysUnderNewMasterKey()`, which re-seals
    // these session keys' PKCS#8 bytes under a new master key via `crypto.subtle.exportKey()` (web-client's
    // Settings > Encryption "rotate keys"). Nothing else exports them. Making them non-extractable would
    // first require that function to re-open the vault's wraps with `masterKey` instead (round-4 review
    // re-flagged this; deliberately left as-is - an XSS that can call `exportKey()` on these handles can
    // equally call `openWithKey()` with the in-memory master key, so non-extractability would not remove
    // that attacker's access, only complicate rotation). The transient
    // PKCS#8 plaintext buffers are zeroed as soon as WebCrypto has copied them into a `CryptoKey`.
    try {
        const signingPublicKey = findActivePublicKey(mailboxKeys, "sign");
        const wrappedSigningKey = signingPublicKey && findWrappedPrivateKey(vault, signingPublicKey.fingerprint);
        if (signingPublicKey && wrappedSigningKey) {
            try {
                const aad = buildAad(mailboxUid, SIGNING_PRIVATE_KEY_AAD_PURPOSE);
                unlocked.signingPrivateKey = await openPrivateKey(masterKey, wrappedSigningKey, aad, { name: "ECDSA", namedCurve: "P-256" }, ["sign"]);
                unlocked.signingCertDer = fromBase64(signingPublicKey.publicKey);
                unlocked.signingFingerprint = signingPublicKey.fingerprint;
            } catch {
                unopenableKeys.push(signingPublicKey.fingerprint);
            }
        }

        const encryptionPublicKey = findActivePublicKey(mailboxKeys, "encrypt");
        const wrappedEncryptionKey = encryptionPublicKey && findWrappedPrivateKey(vault, encryptionPublicKey.fingerprint);
        if (encryptionPublicKey && wrappedEncryptionKey) {
            try {
                const aad = buildAad(mailboxUid, ENCRYPTION_PRIVATE_KEY_AAD_PURPOSE);
                unlocked.encryptionPrivateKey = await openPrivateKey(masterKey, wrappedEncryptionKey, aad, { name: "ECDH", namedCurve: "P-256" }, ["deriveBits"]);
            } catch (err) {
                throw new UnopenableEncryptionKeyError(encryptionPublicKey.fingerprint, err);
            }
            unlocked.encryptionCertDer = fromBase64(encryptionPublicKey.publicKey);
            unlocked.encryptionFingerprint = encryptionPublicKey.fingerprint;
        }
        if (lockGeneration(mailboxUid) !== generation) {
            // Locked (e.g. logout) while this unlock was awaiting - never restore keys after that.
            throw new KeysLockedError();
        }
    } catch (err) {
        // A failed unlock never reaches the session store, so nothing else would ever zero this.
        destroyObject(unlocked);
        throw err;
    }

    // A re-unlock replacing existing keys (e.g. `settings/encryption`'s post-rotation refresh) deliberately
    // does NOT zero the previous entry's master key: an in-flight consumer that captured the old
    // `UnlockedKeys` object (e.g. a local-index build pass) is still legitimately using it, and nothing
    // "destroyed" the session - only `destroyUnlockedKeys()` does that, and it destroys every issued object still
    // reachable. The store itself keeps the replaced object only weakly (see `issued`).
    sessions.set(mailboxUid, unlocked);
    const objects = issued.get(mailboxUid) ?? new Set<WeakHandle<UnlockedKeys>>();
    // Drop handles whose object was already collected, so repeated re-unlocks don't grow the set.
    for (const handle of objects) {
        if (!handle.deref()) {
            objects.delete(handle);
        }
    }
    objects.add(weakHandle(unlocked));
    issued.set(mailboxUid, objects);
    notify({ mailboxUid, state: "unlocked" });
    return { unopenableKeys };
}
