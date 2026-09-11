///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * The "recovery codes" unlock method from `specs/end-to-end_encryption.md`'s "Master Key Wrapping": a
 * set of high-entropy, single-use codes generated client-side and displayed to the user once, at
 * enrolment. Unlike the password method (see `passwordUnlock.ts`), there is no separate auth-proof split
 * — the spec's own wrapping pseudocode derives the wrapping key directly: `wrap_recovery =
 * AEAD(HKDF(recovery_code, salt), MK)`.
 */
import { hkdfDerive } from "./masterKey.js";

/** Crockford base32 alphabet — excludes I/L/O/U to avoid transcription ambiguity with 1/0/V, the same
 * reasoning as TOTP/backup-code schemes elsewhere. */
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 20 random bytes (160 bits) — well above the ~20-bit entropy the spec explicitly calls TOTP out for
 * being too weak (`specs/end-to-end_encryption.md`: "A 6-digit code additionally carries only ~20 bits
 * of entropy"). Encoded as Crockford base32 and grouped into 4-character blocks for transcription. */
const RECOVERY_CODE_ENTROPY_BYTES = 20;
const GROUP_SIZE = 4;

/** Exported for direct unit testing of the padding/remainder-bits path — `generateRecoveryCode()` always
 * calls this with a fixed 20-byte input (160 bits), which happens to divide evenly into 5-bit groups
 * with no remainder, so that path is otherwise unreachable through the public recovery-code API alone. */
export function base32Encode(bytes: Uint8Array): string {
    let bits = 0;
    let value = 0;
    let output = "";
    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += CROCKFORD_ALPHABET[(value >>> (bits - 5)) & 0x1f];
            bits -= 5;
        }
    }
    if (bits > 0) {
        output += CROCKFORD_ALPHABET[(value << (5 - bits)) & 0x1f];
    }
    return output;
}

/** Generates one recovery code, e.g. `"XQ4M-8K2P-7RTN-JY3H-VC9D-WA6F-2E5S"`. Callers should generate
 * several (the spec: "a set of ... codes") and display them once, with explicit user confirmation that
 * they've been saved — losing every unlock method makes the mailbox's encrypted content permanently
 * unreadable (see the spec's "Recovery" section). */
export function generateRecoveryCode(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_CODE_ENTROPY_BYTES));
    const encoded = base32Encode(bytes);
    const groups: string[] = [];
    for (let i = 0; i < encoded.length; i += GROUP_SIZE) {
        groups.push(encoded.slice(i, i + GROUP_SIZE));
    }
    return groups.join("-");
}

/** Derives the wrapping key for one recovery code. `salt` is per-wrap, generated at enrolment and stored
 * alongside the resulting `MasterKeyWrap` (never secret — HKDF's salt need not be). */
export async function deriveFromRecoveryCode(code: string, salt: Uint8Array): Promise<Uint8Array> {
    const ikm = new TextEncoder().encode(code.trim().toUpperCase());
    return hkdfDerive(ikm, salt, "wrap");
}
