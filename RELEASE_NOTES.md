# Release Notes

## Unreleased

Platform-agnostic data/business-logic layer for RapidMX's React frontends - typed API clients and hooks shared
by `rapidmx/server`'s own server-rendered pages, `@rapidmx/web-client`, and `@rapidmx/electron-client`.

This release adds recovery-code unlock, "trust this signer" and plugin search and dependencies, and hardens S/MIME
verification and key handling. It targets `@rapidmx/restapi` 0.10.0 and later; `trustSigner()` needs the next restapi
release.

### Breaking changes

- **Signature verification:**
  - `evaluateMessageSecurity()` only reports `signed_verified` or `encrypted_verified` when the signer matches a pinned
    contact key or the mailbox's own signing key. A valid signature from an unpinned signer is now
    `signed_unverified_signer` or `encrypted_unverified_signer`, with `signerFingerprint`, `signerEmails` and
    `signerCertificate`.
  - The signature is now `evaluateMessageSecurity(raw, unlocked, pinnedSignerFingerprints?, readerAddress?)`.
  - `checkSignerBinding()` takes a string or array of pinned fingerprints, and flags protected Cc (and, with
    `compareSubject`, Subject) mismatches as `header_mismatch`.
- **S/MIME parsing:**
  - `multipart/signed` must have exactly two parts.
  - Detached signatures that carry their own content are rejected.
  - Only AES-GCM encrypted content is decrypted.
  - Duplicate From, To, Cc or Sender headers count as tampering.
- **Key conflicts and pinned-key mismatches:**
  - `Contact.keyConflict` and `KeyLookupResult.keyConflict` are replaced by `keyConflicts` (at most one `KeyConflict`
    per use type, carrying the full `observedKey`).
  - A signature from a pinned sender whose certificate names them and passes the header checks, but matches no pinned
    key, is now `signature_failed` with reason `signer_key_changed` (was `untrusted_signer`), and carries
    `signerCertificate`. `untrusted_signer` remains for a pin mismatch that also fails those checks.
- **Unlock:**
  - `unlockWithPassword()` resolves `{ unopenableKeys }`: a signing key that won't open is skipped.
  - An encryption key that won't open rejects with `UnopenableEncryptionKeyError`.
  - Sealing, opening or deriving with destroyed or zeroed keys throws `KeysLockedError`, and locking destroys every key
    object handed out for the mailbox.
- **`enrollKey()`** is async, and rejects with `VaultAlreadyInitializedError` when the vault was already set up
  elsewhere.
- **Scheduled send:** `setMessageScheduledSendTime()` is removed. Schedule with
  `sendMessage(uid, { scheduledSendTime })`.
- **Plugins:** `addPlugin()` returns `{ plugin, dependencies }`.
- **Calendar:** `saveEventSeries()` can report `detachedOccurrenceSyncFailed`. All-day recurrences expand in UTC.

### Recovery codes and key vault

- **`unlockWithRecoveryCode(mailboxUid, mailboxKeys, code)`** unlocks with any of the mailbox's recovery codes (spacing
  and case don't matter). It reports the code used (`recoveryMethodId`) and `remainingRecoveryCodes`.
- **`consumeRecoveryCode(mailboxUid, methodId)`** removes a used code.
- **`replacePasswordWrap(mailboxUid, unlocked, newPassword, expectedMasterKeyGeneration?)`** replaces a forgotten
  password.
  - It refuses without writing when the master key was rotated elsewhere, when there are two password wraps, or when no
    other unlock method would remain.
  - If adding the new wrap fails, it restores the old one, and throws `PasswordWrapReplaceError` with a `reason`.
  - Call it before consuming the recovery code.
- **`cancelSignEnrollment()`** cancels a pending signing-certificate enrollment. `rekey()` is refused while one is
  pending.
- **Key generation checks:** `KeyVault.masterKeyGeneration`, plus optional `expectedMasterKeyGeneration` on
  `enrollKey()`, `startSignEnrollment()`, `rekey()` and `addMasterKeyWrap()`. The server returns 409 when the key was
  rotated meanwhile.

### Trusting signers

- **`trustSigner(mailboxUid, { address, certificate })`** pins an unpinned sender's signing certificate. It throws
  `SignerKeyConflictError` when a different signing key is already pinned.
- **Pin lookups:** `pinnedSigningFingerprintsFor()`, `fetchPinnedSigningFingerprints()` and `signingKeyFingerprints()`
  read pinned keys without triggering key discovery.
- **Verification results** expose `protectedHeaders` and the `attachments` found inside the signed or encrypted content
  (`extractAttachments()`, `MimeAttachment`).

### Key rotation continuity

- **`resolveKeyConflict(mailboxUid, { address, useType, action, expectedPinnedFingerprint, certificate? })`** accepts or
  rejects a contact's key conflict. It throws `PinnedKeyChangedError` when the pinned key changed meanwhile. Needs the
  next restapi release.
- **Previous keys:** `Contact.previousKeys` and `KeyLookupResult.previousKeys` (`PreviousKey`), `Contact.rejectedKeys`,
  `PublicKey.issuerCertificate` and `PublicKey.revocationReason` (`"superseded"` or `"compromised"`). Previous signing
  keys count as trusted signers in `signingKeyFingerprints()`, `pinnedSigningFingerprintsFor()` and
  `fetchPinnedSigningFingerprints()`, so mail signed before a rotation still verifies.
- **Revocation reasons:** a key revoked as `superseded` (a routine rotation), whether pinned, previous or the mailbox's
  own, is still trusted to verify mail it signed (`isTrustedForVerification()`). A key revoked as `compromised`, or
  revoked with no reason, is never trusted. `findActivePublicKey()` still skips every revoked key.
- **Retained encryption keys:** unlocking (password or recovery code) also opens the mailbox's older encryption keys
  still in the vault - superseded, expired and compromised ones, the 20 most recent - as
  `UnlockedKeys.retainedEncryptionKeys`, so `evaluateMessageSecurity()` decrypts mail encrypted to a key since replaced.
  A retained key that won't open is listed in `unopenableKeys` instead of failing the unlock. Decryption matches the
  message's recipient identifiers to the right key before trying others (`decryptEnvelopedDataWithKeys()`,
  `parseEncryptedMessageWithKeys()`). Retained keys are never used to encrypt or sign.
- **`fetchSignerKeyState(folderUids, address)`** and **`signerKeyStateFor(contacts, address)`** return the pinned and
  previous signing keys and any signing-key conflict, for a key-changed comparison, without triggering key discovery.

### Plugins and mailboxes

- **Plugin API:** `searchPlugins()`, `getPluginUpdates()`, `listPluginNamespaces()`, `planPluginChange()` and
  `expectedPlanOf()`. `PluginManifest` gains `requires` and `mailboxScopedData`.
- **Mailbox access:** `getMyMailboxAccess()` returns the caller's effective access to a mailbox. Mailbox access members
  include custom roles.
- **Retention:** `updateRetentionPolicy()` accepts `null` to clear a period.
- **New fields:** `Message` gains the scheduled-send retry fields (`scheduledSendError`, `scheduledSendAttempts`,
  `scheduledSendRelayedAt` and `scheduledSendLeaseExpiresAt`). Status unions gain `in_progress`, `processing` and
  `transport_rule`.

### Fixes

- **Signed messages:** the signed body of signed-only messages is base64-encoded so mail servers can't break the
  signature by rewrapping lines.
- **Signer certificates:** the certificate that actually signed is used, not the first one in the message. Pin checks
  fail closed, and the signer's email must match From.
- **MIME:** folded headers, preambles, unquoted boundaries, part charsets, raw bytes and quoted-printable are handled
  correctly, and group syntax is kept when encoding addresses.
- **Generated headers:** CR, LF and NUL are stripped from them, and non-ASCII subjects and names are RFC 2047-encoded.
- **Calendar:**
  - recurrences expand in the event's time zone;
  - DST gaps and exceptions are handled when a series moves;
  - drags keep local times.
- **Search and paging:** encrypted search honours `subject:` and `has:attachment`, date-only bounds use local midnight,
  flagged messages and calendar events page with caps, and in-flight tier-3 searches and rewraps abort when keys lock.
- **vCard:** escaping, unfolding and splitting records are fixed.
