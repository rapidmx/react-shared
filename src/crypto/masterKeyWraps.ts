///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Builds a fresh `MasterKeyWrap` for the password and recovery-code unlock methods, given an
 * already-generated (or already-unwrapped) master key (MK). Extracted from `web-client`'s
 * `KeyEnrollmentGate.tsx` (first-sign-in provisioning) so its Settings page's "add a password
 * method"/"regenerate recovery codes" actions - which wrap the *same* MK a second time, not a freshly
 * generated one - can reuse the exact same wrap-construction logic rather than a second, potentially
 * drifting copy of it.
 */
import { toBase64 } from "./encoding.js";
import { buildAad, sealWithKey } from "./masterKey.js";
import { MASTER_KEY_AAD_PURPOSE } from "./keySession.js";
import type { MasterKeyWrap } from "./keyvaultApi.js";
import { Argon2idParams, DEFAULT_ARGON2ID_PARAMS, argon2idKdfLabel, deriveFromPassword, generateSalt } from "./passwordUnlock.js";
import { deriveFromRecoveryCode, generateRecoveryCode } from "./recoveryCode.js";

/** KDF label for a recovery-code wrap - there's no Argon2id step for these (the code itself is already
 * high-entropy, see `recoveryCode.ts`'s own doc comment), just a direct HKDF derivation. */
export const RECOVERY_KDF_LABEL = "hkdf-sha256";
export const WRAP_SCHEME_VERSION = 1;
export const RECOVERY_CODE_COUNT = 8;

/** Wraps `mk` under `password` (fresh Argon2id salt every time, even when replacing an existing
 * password wrap). `params` defaults to this module's own recommended parameters - overridable only so
 * tests can substitute cheaper ones; production callers should omit it and let the default (which can
 * be raised over time, per `passwordUnlock.ts`'s own doc comment on why each wrap stores the exact
 * parameters it was created with) apply. */
export async function buildPasswordWrap(
    mailboxUid: string,
    mk: Uint8Array,
    password: string,
    params: Argon2idParams = DEFAULT_ARGON2ID_PARAMS,
): Promise<MasterKeyWrap> {
    const salt = generateSalt();
    const { wrappingKey } = await deriveFromPassword(password, salt, params);
    const sealed = await sealWithKey(wrappingKey, mk, buildAad(mailboxUid, MASTER_KEY_AAD_PURPOSE));
    return {
        method: "password",
        ciphertext: sealed.ciphertext,
        nonce: sealed.nonce,
        salt: toBase64(salt),
        kdf: argon2idKdfLabel(params),
        schemeVersion: WRAP_SCHEME_VERSION,
        createdAt: Date.now(),
    };
}

/** Generates `count` fresh recovery codes and wraps `mk` under each, returning both the wraps (to
 * upload) and the plaintext codes (to show the user exactly once - callers must never persist these
 * themselves). Each wrap's `methodId` is a sequence label, deliberately not derived from the code
 * itself - that would let anyone who saw a wrap's `methodId` narrow down which physical code it
 * corresponds to. */
export async function buildRecoveryWraps(
    mailboxUid: string,
    mk: Uint8Array,
    count: number = RECOVERY_CODE_COUNT,
): Promise<{ wraps: MasterKeyWrap[]; codes: string[] }> {
    const aad = buildAad(mailboxUid, MASTER_KEY_AAD_PURPOSE);
    const codes: string[] = [];
    const wraps: MasterKeyWrap[] = [];
    for (let i = 0; i < count; i++) {
        const code = generateRecoveryCode();
        const salt = generateSalt();
        const wrappingKey = await deriveFromRecoveryCode(code, salt);
        const sealed = await sealWithKey(wrappingKey, mk, aad);
        codes.push(code);
        wraps.push({
            method: "recovery",
            methodId: `recovery-${i + 1}`,
            ciphertext: sealed.ciphertext,
            nonce: sealed.nonce,
            salt: toBase64(salt),
            kdf: RECOVERY_KDF_LABEL,
            schemeVersion: WRAP_SCHEME_VERSION,
            createdAt: Date.now(),
        });
    }
    return { wraps, codes };
}
