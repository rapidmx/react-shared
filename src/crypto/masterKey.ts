///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * The master-key (MK) wrapping scheme from `specs/end-to-end_encryption.md`'s "Master Key Wrapping":
 * a random 32-byte MK is generated once, private keys are AEAD-encrypted under MK directly, and MK
 * itself is wrapped once per unlock method (password/passkey/recovery — see the sibling `*Unlock.ts`
 * modules) using a key derived via HKDF. MK never leaves this module unwrapped except in memory, and
 * this module never talks to the network — see `keyvaultApi.ts` for what gets sent to the server (only
 * ciphertext, nonces, salts and KDF parameters, all opaque to it).
 */
import { fromBase64, toBase64 } from "./encoding.js";

/** MK is always 32 random bytes (AES-256), per the spec. */
export const MASTER_KEY_LENGTH_BYTES = 32;

/** The one AEAD construction used everywhere in this scheme, per the spec's "MUST use an AEAD
 * construction (AES-256-GCM or XChaCha20-Poly1305)" — this codebase uses AES-256-GCM specifically,
 * since it's natively available via WebCrypto with no additional library on any target platform
 * (browser, Electron renderer). */
export const AEAD_ALGORITHM = "AES-256-GCM";

const GCM_NONCE_LENGTH_BYTES = 12;

/** Generates a fresh master key. Never persisted directly — only ever used to derive an AES-GCM
 * `CryptoKey` in-process (see `sealWithKey`/`openWithKey`) or wrapped via `wrapMasterKey.ts`-style
 * helpers before being sent anywhere. */
export function generateMasterKey(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(MASTER_KEY_LENGTH_BYTES));
}

async function importAeadKey(rawKey: Uint8Array): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", rawKey as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** The wire shape stored/sent for any AEAD-sealed value — matches `WrappedPrivateKey`/`MasterKeyWrap`'s
 * own `ciphertext`/`nonce` fields in `keyvaultApi.ts`. */
export interface Sealed {
    ciphertext: string;
    nonce: string;
}

/**
 * Binds a wrap to the account and purpose it was created for, per the spec: "The user ID and the wrap
 * purpose MUST be bound as additional authenticated data, preventing a blob from being replayed against
 * another account." Passed as AES-GCM's `additionalData` — authenticated but never encrypted, so
 * `openWithKey()` fails closed (throws) if either value doesn't match what `sealWithKey()` was given.
 */
export function buildAad(mailboxUid: string, purpose: string): Uint8Array {
    return new TextEncoder().encode(`${mailboxUid}:${purpose}`);
}

/** AEAD-encrypts `plaintext` under `rawKey` (32 bytes — MK when sealing a private key, or a
 * KDF-derived wrapping key when sealing MK itself). A fresh random nonce is generated per call — GCM
 * requires a unique nonce per key, never reused. */
export async function sealWithKey(rawKey: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Promise<Sealed> {
    const key = await importAeadKey(rawKey);
    const nonce = crypto.getRandomValues(new Uint8Array(GCM_NONCE_LENGTH_BYTES));
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce as BufferSource, additionalData: aad as BufferSource },
        key,
        plaintext as BufferSource,
    );
    return { ciphertext: toBase64(new Uint8Array(ciphertext)), nonce: toBase64(nonce) };
}

/** Inverse of `sealWithKey()`. Throws (WebCrypto's own `OperationError`) if `rawKey`/`aad` don't match
 * what the value was sealed under, or if the ciphertext was tampered with — GCM's authentication tag
 * covers both the ciphertext and the AAD. */
export async function openWithKey(rawKey: Uint8Array, sealed: Sealed, aad: Uint8Array): Promise<Uint8Array> {
    const key = await importAeadKey(rawKey);
    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromBase64(sealed.nonce) as BufferSource, additionalData: aad as BufferSource },
        key,
        fromBase64(sealed.ciphertext) as BufferSource,
    );
    return new Uint8Array(plaintext);
}

/**
 * HKDF-SHA256, used throughout this scheme to turn raw input keying material (an Argon2id output, a
 * WebAuthn PRF secret, a recovery code) into an independent key for a specific purpose — never the raw
 * material directly. `info` binds the derived key to what it's for (e.g. `"wrap"` vs. an auth proof),
 * so the same input material never accidentally produces the same output for two different purposes.
 */
export async function hkdfDerive(ikm: Uint8Array, salt: Uint8Array, info: string, lengthBytes = 32): Promise<Uint8Array> {
    const baseKey = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: salt as BufferSource,
            info: new TextEncoder().encode(info) as BufferSource,
        },
        baseKey,
        lengthBytes * 8,
    );
    return new Uint8Array(bits);
}
