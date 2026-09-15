///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Typed wrappers over `@rapidmx/restapi`'s E2E encryption endpoints (`BaseKeyVaultRoute`,
 * `BaseKeyLookupRoute`, `BaseEncryptionPolicyRoute` — mounted in `server` at `mail/mailboxes` and
 * `system/encryption-policy`, see `src/{mongo,sql}/routes/{KeyVaultRoute,KeyLookupRoute,
 * EncryptionPolicyRoute}.ts`). These calls carry only wrapped/ciphertext key material and public
 * certificates — the server never sees an unwrapped private key or master key; see `crypto/masterKey.ts`
 * and `crypto/keys.ts` for the client-side cryptography that produces the values passed here.
 */
import { ApiRequestError, apiFetch } from "../util/api.js";

/** A cryptographic public key used to sign or encrypt messages — safe to expose publicly. Mirrors
 * `@rapidmx/restapi`'s `PublicKey` type exactly. */
export interface PublicKey {
    /** Base64-encoded DER X.509 certificate. */
    publicKey: string;
    /** The key's type/format (e.g. `x509`). */
    type: string;
    useType: "sign" | "encrypt";
    /** SHA-256 fingerprint of the certificate, hex encoded. */
    fingerprint: string;
    /** UTC timestamp (epoch ms) at which this key becomes valid. */
    notBefore: number;
    /** UTC timestamp (epoch ms) at which this key expires. */
    notAfter: number;
    /** UTC timestamp (epoch ms) at which this key was revoked, if applicable. */
    revokedAt?: number;
}

/** A private key encrypted under the mailbox's master key (MK). Mirrors `@rapidmx/restapi`'s
 * `WrappedPrivateKey` exactly. */
export interface WrappedPrivateKey {
    /** Base64-encoded AEAD ciphertext of the private key. */
    ciphertext: string;
    /** Base64-encoded AEAD nonce. */
    nonce: string;
    /** AEAD algorithm identifier (e.g. `AES-256-GCM`). */
    algorithm: string;
    fingerprint: string;
    useType: "sign" | "encrypt";
}

/** One wrapped copy of the mailbox master key (MK), per unlock method. Mirrors `@rapidmx/restapi`'s
 * `MasterKeyWrap` exactly. */
export interface MasterKeyWrap {
    method: "password" | "passkey" | "recovery" | "escrow";
    /** Opaque identifier for the method instance (e.g. a WebAuthn credential ID). */
    methodId?: string;
    escrowScopeId?: string;
    /** Base64-encoded AEAD ciphertext of the master key. */
    ciphertext: string;
    /** Base64-encoded AEAD nonce. */
    nonce: string;
    /** Base64-encoded KDF salt. */
    salt: string;
    /** KDF identifier and parameters (e.g. `argon2id:m=65536,t=3,p=4`). */
    kdf: string;
    schemeVersion: number;
    createdAt: number;
}

export interface EncryptionPreference {
    lastSeen?: number;
    preferEncrypt: "mutual" | "nopreference";
}

export interface KeyConflict {
    observedFingerprint: string;
    observedAt: number;
    source: "header" | "discovery";
}

/** The wire shape `GET`/`POST`/`PUT`/`DELETE` `/mail/mailboxes/:id/keyvault*` return. */
export interface KeyVault {
    wrappedKeys: WrappedPrivateKey[];
    masterKeyWraps: MasterKeyWrap[];
    /** How many times the vault's master key has been rotated (`0` for never, and for no vault yet). Send it back as
     * `expectedMasterKeyGeneration` on a write whose key material was sealed under the master key read with this vault
     * (`enrollKey()`, `startSignEnrollment()`, `addMasterKeyWrap()`, `rekey()`), so restapi refuses it with `409` if
     * another device rotated the master key meanwhile. Absent from servers that don't track it yet. */
    masterKeyGeneration?: number;
}

/** The optional optimistic check restapi applies to vault writes carrying key material sealed under the master key. */
export interface ExpectedMasterKeyGeneration {
    /** The `KeyVault.masterKeyGeneration` read alongside the master key this request's material is sealed under. When
     * given and the vault's generation has moved on, restapi answers `409` instead of installing material nobody can
     * open with the current master key. Omitted, the write is accepted as before. */
    expectedMasterKeyGeneration?: number;
}

/** Fetches the caller's key vault (wrapped private keys + wrapped master-key copies) for `mailboxUid`. */
export function getKeyVault(mailboxUid: string): Promise<KeyVault> {
    return apiFetch(`/mail/mailboxes/${encodeURIComponent(mailboxUid)}/keyvault`);
}

/** The most recently issued, currently-valid (non-revoked, non-expired) published key of the given use
 * type — the one that should actually be used to sign/encrypt going forward. A mailbox or contact may
 * have several of the same `useType` on file after a rotation; older ones are kept for decrypting old
 * mail, never removed, per the spec's own key-lifecycle rules. Shared by `crypto/keySession.ts` (the
 * mailbox's own keys) and `crypto/composeSecurity.ts` (a recipient's discovered keys). */
export function findActivePublicKey(keys: PublicKey[], useType: "sign" | "encrypt"): PublicKey | undefined {
    const now = Date.now();
    return keys
        .filter((k) => k.useType === useType && !k.revokedAt && k.notAfter > now)
        .sort((a, b) => b.notBefore - a.notBefore)[0];
}

/** The fingerprints (lowercased) of every signing key in `keys` that hasn't been revoked - the trusted pins to pass
 * to `messageSecurity.ts`'s `evaluateMessageSecurity()` for a `Contact` (its TOFU-pinned `keys`, which only key
 * discovery can write) or a `Mailbox` (its own `keys`). Expired keys are kept: mail signed while a key was valid
 * stays verifiable after it expires. */
export function signingKeyFingerprints(keys: PublicKey[] | undefined): string[] {
    return (keys ?? []).filter((key) => key.useType === "sign" && !key.revokedAt).map((key) => key.fingerprint.toLowerCase());
}

export interface EnrollKeyInput extends ExpectedMasterKeyGeneration {
    useType: "sign" | "encrypt";
    /** PEM-encoded PKCS#10 CSR — required (and only meaningful) for `useType: "encrypt"`; the server
     * calls its own internal CA against this CSR. */
    csr?: string;
    /** An already-issued PEM certificate — required (and only meaningful) for `useType: "sign"`. */
    certificate?: string;
    wrappedKey: Omit<WrappedPrivateKey, "fingerprint" | "useType">;
    /** Only meaningful the very first time a mailbox enrolls a key at all (bootstraps its master key). */
    masterKeyWraps?: MasterKeyWrap[];
}

/**
 * Thrown by `enrollKey()` when `masterKeyWraps` were supplied (a first-time vault setup) but the mailbox's vault
 * already has master-key wraps - e.g. another device or tab finished setting it up first. restapi answers `409`;
 * this subclass (still an `ApiRequestError` with `status` 409) is only used once a re-read of the vault confirms it
 * really has wraps, so an unrelated `409` (a lost optimistic-lock race) isn't mistaken for it. A caller should
 * unlock the existing vault instead of enrolling a new master key.
 */
export class VaultAlreadyInitializedError extends ApiRequestError {
    constructor(message: string, code?: string) {
        super(message, 409, code);
        this.name = "VaultAlreadyInitializedError";
    }
}

/** Enrolls a new signing or encryption key. See `EnrollKeyInput`'s own doc comments for which fields
 * matter for which `useType`. Rejects with `VaultAlreadyInitializedError` when `masterKeyWraps` were supplied
 * but the vault is already set up (see that class). */
export async function enrollKey(mailboxUid: string, input: EnrollKeyInput): Promise<KeyVault> {
    try {
        return await apiFetch<KeyVault>(`/mail/mailboxes/${encodeURIComponent(mailboxUid)}/keyvault/keys`, {
            method: "POST",
            body: JSON.stringify(input),
        });
    } catch (err) {
        if (err instanceof ApiRequestError && err.status === 409 && input.masterKeyWraps?.length) {
            const vault = await getKeyVault(mailboxUid).catch(() => undefined);
            if (vault && vault.masterKeyWraps.length > 0) {
                throw new VaultAlreadyInitializedError(err.message, err.code);
            }
        }
        throw err;
    }
}

export interface SignEnrollmentRequest extends ExpectedMasterKeyGeneration {
    /** A PEM-encoded PKCS#10 CSR for the signing key pair to enroll. */
    csr: string;
    wrappedKey: Omit<WrappedPrivateKey, "fingerprint" | "useType">;
}

/** The status of a started automated (RFC 8823 ACME) signing-certificate enrollment. Mirrors
 * `@rapidmx/restapi`'s `EnrollmentResult` exactly. */
export interface EnrollmentResult {
    status: "pending" | "issued" | "failed";
    /** The issued certificate, PEM-encoded — present only once `status` is `"issued"`. Not needed
     * client-side: once issued, restapi's own `AcmeEnrollmentDriverJob` auto-installs it into this
     * mailbox's `KeyVault` server-side, using the `wrappedKey` already submitted in
     * `startSignEnrollment()` — no further client action installs it. */
    certificate?: string;
    /** A human-readable reason — present only once `status` is `"failed"`. */
    error?: string;
}

/** Starts an automated (RFC 8823 email-reply-00 ACME) public-CA signing-certificate enrollment —
 * only meaningful when the deployment has `mail:pki:signing_enrollment:backend` set to `"rfc8823"`
 * (a `"manual"`-backend deployment's `SigningCertificateEnrollment` throws instead). Genuinely
 * asynchronous — the CA issues the certificate via a real email round-trip, likely minutes away, not
 * synchronous the way `enrollKey()`'s encryption-key path is — poll `checkSignEnrollmentStatus()`
 * rather than expecting an immediate result. `wrappedKey` is submitted upfront (this server never sees
 * an unwrapped private key) so the eventual install needs no further client action at all. */
export function startSignEnrollment(mailboxUid: string, input: SignEnrollmentRequest): Promise<{ enrollmentId: string }> {
    return apiFetch(`/mail/mailboxes/${encodeURIComponent(mailboxUid)}/keyvault/keys/sign-enrollment`, {
        method: "POST",
        body: JSON.stringify(input),
    });
}

/** Reports the current status of a previously started automated enrollment — see
 * `startSignEnrollment()`. */
export function checkSignEnrollmentStatus(mailboxUid: string, enrollmentId: string): Promise<EnrollmentResult> {
    return apiFetch(
        `/mail/mailboxes/${encodeURIComponent(mailboxUid)}/keyvault/keys/sign-enrollment/${encodeURIComponent(enrollmentId)}`,
    );
}

/** Cancels a pending automated enrollment of this mailbox, so no key is installed from it afterwards, and returns its
 * resulting status. Owner-only. `rekey()` is refused (409) while an enrollment holding a wrapped key is in flight, so
 * this is how an owner with an enrollment stuck at the CA gets to rotate their keys. */
export function cancelSignEnrollment(mailboxUid: string, enrollmentId: string): Promise<EnrollmentResult> {
    return apiFetch(
        `/mail/mailboxes/${encodeURIComponent(mailboxUid)}/keyvault/keys/sign-enrollment/${encodeURIComponent(enrollmentId)}`,
        { method: "DELETE" },
    );
}

/** An escrow scope's public key, exposed only via `getEscrowInfo()` below. Mirrors `@rapidmx/restapi`'s
 * `EscrowScopePublicKey` exactly - the same shape as `PublicKey` minus `useType` (an escrow scope's key
 * is only ever used for encryption, never signing). */
export interface EscrowScopePublicKey {
    /** Base64-encoded DER X.509 certificate. */
    publicKey: string;
    type: string;
    fingerprint: string;
    notBefore: number;
    notAfter: number;
    revokedAt?: number;
}

/** The wire shape `GET /mail/mailboxes/:id/escrow-info` returns - see that route's own doc comment
 * (`server`'s `BaseEscrowInfoRoute`) for why this exists as a `server`-only proxy rather than a restapi
 * route: `@rapidmx/restapi`'s own `GET /escrow-scopes/:id` is trusted-admin-only, with no lighter
 * alternative a mailbox owner could use to read the one scope their own mailbox is assigned to. */
export interface EscrowInfo {
    escrowScopeId: string;
    publicKey: EscrowScopePublicKey;
}

/** Fetches `{escrowScopeId, publicKey}` for the `EscrowScope` this mailbox is currently assigned to
 * (`Mailbox.escrowScopeId`, an admin-only assignment - see `EscrowInfo`'s own doc comment). 404s if the
 * mailbox has no escrow scope assigned, the scope no longer exists, or the caller can't access this
 * mailbox. Used by `crypto/masterKeyWraps.ts`'s `buildEscrowWrap()` to get the certificate MK is wrapped
 * against. */
export function getEscrowInfo(mailboxUid: string): Promise<EscrowInfo> {
    return apiFetch(`/mail/mailboxes/${encodeURIComponent(mailboxUid)}/escrow-info`);
}

/** Adds a wrapped copy of the master key for a new unlock method (e.g. registering a new passkey),
 * independent of key enrollment. Requires an already-initialized vault. `expectedMasterKeyGeneration`, when given, is
 * sent alongside the wrap (see `ExpectedMasterKeyGeneration`): a `409` then means the master key was rotated since. */
export function addMasterKeyWrap(mailboxUid: string, wrap: MasterKeyWrap, expectedMasterKeyGeneration?: number): Promise<KeyVault> {
    const body = expectedMasterKeyGeneration === undefined ? wrap : { ...wrap, expectedMasterKeyGeneration };
    return apiFetch(`/mail/mailboxes/${encodeURIComponent(mailboxUid)}/keyvault/wraps`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

/** Removes a wrapped copy of the master key for one unlock method. `methodId` is required whenever more
 * than one wrap could share the same `method` (e.g. multiple passkeys). This alone does NOT revoke
 * access for anyone who already captured the wrapped blob — see `rekey()`. */
export function removeMasterKeyWrap(mailboxUid: string, method: string, methodId?: string): Promise<KeyVault> {
    const query = methodId ? `?methodId=${encodeURIComponent(methodId)}` : "";
    return apiFetch(`/mail/mailboxes/${encodeURIComponent(mailboxUid)}/keyvault/wraps/${encodeURIComponent(method)}${query}`, {
        method: "DELETE",
    });
}

export interface RekeyInput extends ExpectedMasterKeyGeneration {
    wrappedKeys: WrappedPrivateKey[];
    /** Every wrap of the new master key. For a mailbox assigned an escrow scope, this must include a fresh escrow wrap
     * for that scope (`buildEscrowWrap()`): `rekey()` drops the old escrow wraps and refuses (409) an escrowed
     * mailbox's rekey without a replacement. */
    masterKeyWraps: MasterKeyWrap[];
    keys: PublicKey[];
}

/** Full, atomic replacement of the mailbox's key-vault contents — the only real revocation mechanism
 * for a captured wrap. Restricted server-side to the mailbox's actual owner. Refused (409) while a signing enrollment
 * holding a wrapped key is in flight (see `cancelSignEnrollment()`), or when an escrowed mailbox's request carries no
 * replacement escrow wrap. */
export function rekey(mailboxUid: string, input: RekeyInput): Promise<KeyVault> {
    return apiFetch(`/mail/mailboxes/${encodeURIComponent(mailboxUid)}/keyvault/rekey`, {
        method: "PUT",
        body: JSON.stringify(input),
    });
}

/** The wire shape `GET /mail/mailboxes/:id/keys/lookup` returns. */
export interface KeyLookupResult {
    keys: PublicKey[];
    encryptPreference?: EncryptionPreference;
    keyConflict?: KeyConflict;
}

/** Server-side Discovery: the server itself performs the `_rapidmx` DNS lookup and remote key-endpoint
 * fetch (browsers can't do DNS TXT lookups, and a direct cross-origin fetch would hit CORS), persisting
 * the result onto a `Contact` in the caller's own address book. MUST be called lazily at compose time,
 * never on message receipt (see `specs/end-to-end_encryption.md`'s "Discovery is Server-Side"). */
export function lookupKeys(mailboxUid: string, addr: string): Promise<KeyLookupResult> {
    const query = new URLSearchParams({ addr });
    return apiFetch(`/mail/mailboxes/${encodeURIComponent(mailboxUid)}/keys/lookup?${query.toString()}`);
}

/** What `trustSigner()` pins: the sender's address and the certificate that signed their message. */
export interface TrustSignerInput {
    address: string;
    /** Base64 DER of the signer certificate - `MessageSecurityResult.signerCertificate`. */
    certificate: string;
}

/**
 * Thrown by `trustSigner()` when restapi answers `409`: a different signing key is already pinned for that address, so
 * trusting this one would silently replace it. Still an `ApiRequestError` (`status` 409). A UI should show this as a
 * key conflict for the user to resolve deliberately, not retry.
 */
export class SignerKeyConflictError extends ApiRequestError {
    constructor(message: string, code?: string) {
        super(message, 409, code);
        this.name = "SignerKeyConflictError";
    }
}

/**
 * "Trust this signer": pins `certificate` as `address`'s signing key on the caller's contact for that address
 * (`POST /mail/mailboxes/:id/keys/trust`), after which `evaluateMessageSecurity()` given that contact's pins reports
 * the sender's signed mail as verified. Resolves with the contact's resulting key state, the same shape as
 * `lookupKeys()`. Rejects with `SignerKeyConflictError` on `409` (a different signing key is already pinned), and a
 * plain `ApiRequestError` for `400` (an invalid certificate, or one that doesn't name `address`) and `403`/`404`.
 */
export async function trustSigner(mailboxUid: string, input: TrustSignerInput): Promise<KeyLookupResult> {
    try {
        return await apiFetch<KeyLookupResult>(`/mail/mailboxes/${encodeURIComponent(mailboxUid)}/keys/trust`, {
            method: "POST",
            body: JSON.stringify({ address: input.address, certificate: input.certificate }),
        });
    } catch (err) {
        if (err instanceof ApiRequestError && err.status === 409) {
            throw new SignerKeyConflictError(err.message, err.code);
        }
        throw err;
    }
}

export type PolicyState ="automatic" | "optional" | "prohibited";

export interface EncryptionPolicy {
    encryptSameOrg: PolicyState;
    encryptFederated: PolicyState;
    encryptExternal: PolicyState;
}

/** The system-wide encryption policy (readable by any authenticated user, used to decide what encryption
 * controls a compose UI should offer). */
export function getEncryptionPolicy(): Promise<EncryptionPolicy> {
    return apiFetch(`/system/encryption-policy`);
}

/** Admin-only (`RequiresTrustedRole`) — updates the system-wide encryption policy. */
export function updateEncryptionPolicy(patch: Partial<EncryptionPolicy>): Promise<EncryptionPolicy> {
    return apiFetch(`/system/encryption-policy`, {
        method: "PUT",
        body: JSON.stringify(patch),
    });
}
