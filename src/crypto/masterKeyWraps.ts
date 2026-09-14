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
 *
 * Every builder throws `KeysLockedError` (`masterKey.ts`) when `mk` is a destroyed (all-zero) master key -
 * wrapping one would upload a wrap that "unlocks" to a useless key.
 */
import { toBase64 } from "./encoding.js";
import { assertKeyMaterialUsable, buildAad, sealWithKey } from "./masterKey.js";
import { MASTER_KEY_AAD_PURPOSE } from "./keySession.js";
import type { MasterKeyWrap } from "./keyvaultApi.js";
import { Argon2idParams, DEFAULT_ARGON2ID_PARAMS, argon2idKdfLabel, deriveFromPassword, generateSalt } from "./passwordUnlock.js";
import { deriveFromRecoveryCode, generateRecoveryCode } from "./recoveryCode.js";
import { encryptForRecipients } from "./smime.js";

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
    assertKeyMaterialUsable(mk);
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
    assertKeyMaterialUsable(mk);
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

/** `nonce`/`salt` labels for an escrow wrap - see `buildEscrowWrap()`'s own doc comment for why these
 * are fixed placeholders rather than freshly generated values, unlike every other wrap method.
 * Deliberately NOT valid base64 (`fromBase64("n/a")` decodes to 2 arbitrary bytes rather than throwing,
 * since only a length of `4n+1` makes `atob()` reject its input) - any future generic
 * `fromBase64(wrap.salt)`/`fromBase64(wrap.nonce)` refactor across every wrap method MUST special-case
 * (or simply skip) `method === "escrow"` first, or it will silently "succeed" with garbage bytes instead
 * of failing loudly. Nothing in this codebase does that generically today (`keySession.ts` only ever
 * reads `.salt`/`.nonce` after already filtering to `method === "password"`), but it's exactly the kind
 * of innocent-looking refactor that would reintroduce this as a real bug. */
export const ESCROW_KDF_LABEL = "cms-enveloped-data";
const ESCROW_NONCE_PLACEHOLDER = "n/a";
const ESCROW_SALT_PLACEHOLDER = "n/a";

/**
 * Wraps `mk` for the `escrow` unlock method: encrypts it as a CMS `EnvelopedData` structure to the
 * escrow scope's own X.509 public-key certificate (`keyvaultApi.ts`'s `getEscrowInfo()` return value) -
 * the exact same "encrypt to a recipient's certificate" operation `smime.ts`'s `encryptForRecipients()`
 * already implements for message bodies, just applied to MK instead. Matches
 * `specs/end-to-end_encryption.md`'s `wrap_escrow = AEAD(escrow scope public key, MK)` pseudocode.
 *
 * Unlike `buildPasswordWrap()`/`buildRecoveryWraps()`, there is no separately-generated salt or nonce
 * here - CMS `EnvelopedData` already embeds everything a holder's own offline tooling needs to unwrap
 * (the content-encryption algorithm, its IV, and the ECDH key-agreement material) inside the ciphertext
 * itself. `nonce`/`salt` are still populated with a fixed, documented placeholder rather than left empty
 * because restapi's own `validateMasterKeyWrap()` requires every `MasterKeyWrap` field to be a non-empty
 * string regardless of method - they carry no cryptographic meaning for this method and a holder's
 * unwrap tooling must never read them.
 *
 * This client never has (and this function never touches) the scope's *private* key - only a holder's
 * own external tooling can ever unwrap the result. `escrowScopeId` is required so `resolveAllowEscrow()`
 * (server-side) can confirm it matches the mailbox's actually-assigned scope before persisting.
 */
export async function buildEscrowWrap(mk: Uint8Array, escrowScopeId: string, scopePublicKeyCertDer: Uint8Array): Promise<MasterKeyWrap> {
    assertKeyMaterialUsable(mk);
    const envelopedDer = await encryptForRecipients(mk, [scopePublicKeyCertDer]);
    return {
        method: "escrow",
        escrowScopeId,
        ciphertext: toBase64(envelopedDer),
        nonce: ESCROW_NONCE_PLACEHOLDER,
        salt: ESCROW_SALT_PLACEHOLDER,
        kdf: ESCROW_KDF_LABEL,
        schemeVersion: WRAP_SCHEME_VERSION,
        createdAt: Date.now(),
    };
}
