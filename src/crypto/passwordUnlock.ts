///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * The "password" unlock method from `specs/end-to-end_encryption.md`'s "Master Key Wrapping": derives a
 * single Argon2id output from the user's password, then HKDF-splits it into two independent values so
 * the plaintext password (and the Argon2id output itself) never has to be transmitted or reused for two
 * purposes — an authentication proof and a device-only wrapping key.
 *
 * `wrappingKey` is used with `masterKey.ts`'s `sealWithKey`/`openWithKey` to wrap/unwrap MK, and is never
 * sent anywhere. `authProof` is derived for a future server-side "does this look like the right password"
 * online-guess-rate-limiting check (distinct from `wrappingKey`, so the server can never derive the
 * wrapping key even if it learns the proof) — no such verification endpoint exists in `@rapidmx/restapi`
 * yet, so today only `wrappingKey` is actually consumed; `authProof` is produced now so the wire format
 * (`kdf` string on `MasterKeyWrap`) doesn't need to change when that endpoint is added.
 */
import { argon2id } from "hash-wasm";
import { toBase64 } from "./encoding.js";
import { hkdfDerive } from "./masterKey.js";

export interface Argon2idParams {
    /** Memory cost, in KiB. */
    memorySize: number;
    iterations: number;
    parallelism: number;
}

/** Matches the `kdf` string format `MasterKeyWrap.kdf` documents (`argon2id:m=65536,t=3,p=4`) — OWASP's
 * current recommended minimum for Argon2id (m=19MiB is the OWASP floor; this is deliberately higher,
 * matching the doc comment on `EncryptionCertificateAuthority`'s own conservative defaults elsewhere in
 * this system). */
export const DEFAULT_ARGON2ID_PARAMS: Argon2idParams = { memorySize: 65536, iterations: 3, parallelism: 4 };

const ARGON2ID_HASH_LENGTH_BYTES = 32;

/** Builds the `kdf` string stored alongside a password-method `MasterKeyWrap`, so parameters can be
 * upgraded over time without breaking existing accounts (each wrap records the parameters it was
 * actually created with). */
export function argon2idKdfLabel(params: Argon2idParams): string {
    return `argon2id:m=${params.memorySize},t=${params.iterations},p=${params.parallelism}`;
}

/** A fresh random salt for a new password enrollment. 16 bytes is Argon2id's own recommended minimum. */
export function generateSalt(lengthBytes = 16): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(lengthBytes));
}

export interface PasswordDerivation {
    /** Base64-encoded. See this module's own doc comment — not yet sent anywhere, reserved for a future
     * server-side verification endpoint. */
    authProof: string;
    /** Never leaves the device. Passed directly to `masterKey.ts`'s `sealWithKey`/`openWithKey`. */
    wrappingKey: Uint8Array;
}

/**
 * Runs Argon2id once against `password`/`salt`, then HKDF-splits the result into `authProof` and
 * `wrappingKey` (see this module's doc comment for why two independent values, not one reused for both
 * purposes). The plaintext password itself never leaves this function.
 */
export async function deriveFromPassword(
    password: string,
    salt: Uint8Array,
    params: Argon2idParams = DEFAULT_ARGON2ID_PARAMS,
): Promise<PasswordDerivation> {
    const argonOutput: Uint8Array = await argon2id({
        password,
        salt,
        memorySize: params.memorySize,
        iterations: params.iterations,
        parallelism: params.parallelism,
        hashLength: ARGON2ID_HASH_LENGTH_BYTES,
        outputType: "binary",
    });
    const [authProofBytes, wrappingKey] = await Promise.all([
        hkdfDerive(argonOutput, salt, "auth-proof"),
        hkdfDerive(argonOutput, salt, "wrap"),
    ]);
    return { authProof: toBase64(authProofBytes), wrappingKey };
}
