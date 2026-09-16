# Release Notes

## Unreleased

### Features

- **Filter the mail list by label (`mail/mailApi.js`, `mail/conversationsApi.js`).** `listMessages(folderUid, params)`
  and `listConversations(mailboxUid, params)` now take `labelUids: string[]` — the `Label.uid`s to filter by, sent as
  one comma-separated `labelUids` parameter. A message is listed if it carries **any** of them (OR), which is then
  ANDed with `filter`, so `{ filter: "unread", labelUids: [red, blue] }` means "unread, and labelled red or blue".
  Order is irrelevant and duplicates are ignored; the server applies it over the whole folder before paging, and (for
  conversations) to the messages before they are grouped. An empty array sends no parameter at all, so an untouched
  filter menu makes exactly the request it always made. New `MAX_MESSAGE_LABEL_FILTER` (20, the server's own cap — a
  longer set is refused with a 400, as is a uid that isn't one). A uid naming no label, or one belonging to another
  mailbox, matches nothing rather than erroring. Populate the menu itself with `listLabels(mailboxUid)` from
  `mail/labelsApi.js` — labels are per-mailbox (needs the next `@rapidmx/restapi` release).
- **Server-side mail list sorting and filtering (`mail/mailApi.js`).** `listMessages(folderUid, params)` now takes
  `sortBy` (`date` | `sentDate` | `from` | `subject` | `importance` | `flagged`), `sortOrder` (`asc` | `desc`) and
  `filter` (`all` | `unread` | `read` | `flagged` | `hasAttachments` | `focused` | `other`) alongside `limit`/`page`,
  and sends none of them unless set - the server already defaults to newest received first with a stable tiebreaker.
  The sort and the filter are applied over the whole folder by the database, not over the page that comes back, so
  paging stays correct under either. New `MessageListSort`, `MessageSortOrder`, `MessageListFilter` and
  `MessageListParams` types (needs the next `@rapidmx/restapi` release).
- **Bulk message actions (`mail/mailApi.js`).** `bulkUpdateMessages(updates)` sends a whole selection through
  `PUT /mail/messages` in chunks of `MAX_BULK_MESSAGE_UPDATE` (100, the server's own cap), with
  `setMessagesRead()`, `setMessagesFlagged()`, `moveMessages()` and `setMessagesLabels()` over it - the bulk forms of
  the existing single-message calls, plus new single-message `setMessageFlagged()` and `moveMessage()`. Not atomic:
  the server applies each element in order and stops at the first failure (a stale `version`, a refused move),
  leaving earlier elements applied, so refetch the list on a rejection rather than assuming nothing happened.
- **Nested conversation view (`mail/conversationsApi.js`).** `listConversations(mailboxUid, params)` now takes
  `folderUid`, `filter`, `limit` and `page`, and `ConversationSummary` gains `flagged`, `latestMessageUid`,
  `latestFrom`, `latestPreview` and `latestFolderUid` - what a collapsed parent row shows. New
  `listConversationMessages(mailboxUid, conversationId, params)` returns that conversation's messages oldest first
  across every folder (the expanded child rows), paged; it resolves a summary's `conversationId` whether the
  conversation is a real thread or a single message that belongs to none. `CONVERSATION_SCAN_LIMIT` (500) documents
  how many messages the server groups per call.
- **`Message` gains the server-managed list mirrors** `read`, `flagged`, `fromAddress` and `importanceRank`. They
  exist so the *server* can index and sort; read `flags`/`from`/`importance` as before. They are never accepted in a
  request body, and a message stored before they existed carries none of them.
- **`listFlaggedMessages()` now asks the server for flagged messages** (`filter: "flagged"`) instead of reading every
  message in every folder and filtering in the browser. It still fans out one paged call per mail folder, because a
  message list is folder-scoped and this smart list is not.

- **Recipient suggestions:** new `mail/directoryApi.js` for compose autocomplete, over `@rapidmx/restapi`'s new
  `GET /mail/directory` and `GET /mail/directory/contacts` (needs the next restapi release).
  - `searchDirectory(query, { limit, signal })` searches the server's mailboxes (people, shared mailboxes, rooms and
    equipment) and distribution lists; `searchContactSuggestions(query, { mailboxUid, limit, signal })` searches the
    caller's contacts, plus `mailboxUid`'s when the caller may read it. Both resolve to `RecipientSuggestion`
    (`{ displayName, address, kind }`), make no request for a query shorter than 2 characters and cut one longer than
    100.
  - `fetchRecipientSuggestions(query, options)` runs both and merges them with `mergeRecipientSuggestions()`: contacts
    first, addresses de-duplicated case-insensitively, at most `limit` (default 8). One source failing (for example
    a 403 directory for a caller with no mailbox on the server) still returns the other's entries; an abort rejects
    with the `AbortError`.
- **Reply/forward composition (`mail/compose/composeQuoting.js`):**
  - `buildReplyQuote(message, body?)` and `buildForwardQuote(message, body?)` now quote the message's full body, passed
    in as `QuotedBody` (`{ html?, text? }`: the sanitized HTML body the reader saw, the decrypted or verified content,
    or the plain-text body). HTML is sanitized with `sanitizeQuotedHtml()`, text is HTML-escaped, and
    `message.bodyPreview` (a truncated, server-derived excerpt) is only the fallback when neither could be loaded.
    The reply attribution line now names the sender as `Name <address>`.
  - `buildComposeBodyHtml(signatureHtml?, quotedHtml?)` lays out a compose body the way Outlook and Gmail do: an empty
    paragraph first (where the caret goes), then the signature, then the quote.
  - `buildReplyRecipients(message, ownAddresses, replyAll)` resolves a reply's To and Cc: never the replying mailbox's
    own addresses (primary plus aliases, compared case-insensitively), never the same address twice, never Bcc
    recipients, display names kept. Reply All adds the original To to To and the original Cc to Cc; a reply to a
    message the mailbox sent itself goes to the original recipients instead of back to itself.
  - `recipientDisplayName(recipient)` (used by all of the above) drops the address a display name may carry - an
    ingested message's `from` holds its whole `"Bob Allen" <bob@example.com>` From header as the display name, which
    would otherwise be addressed and quoted as `"Bob Allen" <bob@example.com> <bob@example.com>`. A name that is a
    different address than the recipient's own is dropped entirely.
- **`mail/messageBodySanitizer.js`:** the client-side message-body sanitizer (moved here from `@rapidmx/web-client`'s
  `MessageDetailPane`): `sanitizeMessageBodyHtml()` for a displayed body, `sanitizeQuotedHtml()` for one quoted into a
  compose body (also without styles, forms, frames, media and any image that isn't a `data:` URI), and
  `stripRemoteCssUrls()`. Both drop every remote resource reference, so nothing quoted or displayed can ping a tracker,
  and both return `""` (never the unsanitized input) where there is no DOM to sanitize with.

## v0.6.0

### Breaking changes

- **Booking moved out:** `booking/bookingApi.js` (`listBookingTypes()`, `createBookingType()`, `getBookingSlots()`,
  `bookSlot()`, `bookingManageUrl()` and the rest of the booking types and bookings client, with its `BookingType`,
  `PublicBooking` and related types) is removed. It now ships in `@rapidmx/booking-plugin`, with the `/mail/booking-types`
  and `/mail/bookings` routes. Resource booking fields on mailboxes (`autoAcceptBookings`, `bookingWindowDays` and
  friends) are unchanged.

## v0.5.0

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
- **Key rotation:** `rewrapPrivateKeysUnderNewMasterKey()` and `crypto/keyRotation.js` are removed. The helper re-wrapped
  only the active keys, so using it with `rekey()` would drop the retained key wraps; nothing called it. Re-seal every
  vault wrap under the new master key instead.
- **Security states:** `MessageSecurityState` gains `"verified_at_first_open"`. Only `evaluateMessageSecurityWithSeal()`
  returns it, but an exhaustive map over the union (e.g. a label per state) needs an entry.

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

### Verification seals

- **Seals:** `buildVerificationSeal(mailboxUid, unlocked, input)` seals a verified result (message uid, raw MIME hash,
  signer fingerprint, state, time and master key generation) with an HMAC keyed from the master key, so the server can't
  forge one. `openVerificationSeal(mailboxUid, unlocked, messageUid, seal, rawSha256, expectedMasterKeyGeneration?)`
  returns the sealed signer, state, time and generation only for a valid seal on the same mailbox, message, raw MIME
  and generation. `rawMimeSha256(raw)` hashes raw MIME.
- **`evaluateMessageSecurityWithSeal(raw, unlocked, pins, readerAddress, { mailboxUid, messageUid, masterKeyGeneration, seal?, sealGeneration?, signerKeys?, now? })`:**
  - a live verified result without a seal valid for the current generation, or whose stored seal is from an older
    generation, gains `sealToWrite: { seal, masterKeyGeneration }` for the caller to store;
  - a result that fails only because of the signer key's status (`signer_key_changed`, or an unverified signer after
    a pin was removed or revoked) becomes `"verified_at_first_open"` when a valid seal names the same signer, with
    `verifiedAt`, `sealedState`, the content, and `laterCompromised` when `signerKeys` show that key is now compromised;
  - an invalid signature, a header or identity mismatch, tampering, or a seal for a different message, raw MIME or
    signer is never overridden.
  - `evaluateMessageSecurity()` is unchanged.
- **`setMessageVerificationSeal(messageUid, seal, masterKeyGeneration)`** stores a seal on a message
  (`Message.verificationSeal`, `Message.verificationSealGeneration`). The server replaces a stored seal only with one
  for the vault's current generation when the stored one is older; otherwise it throws `VerificationSealConflictError`.
  Needs the next restapi release.
- **Key rotation:** seals are not carried across a master key rotation, so a rotation after a suspected compromise
  can't vouch for seals written with the old key. Those messages show their live result until they next verify live,
  when they are re-sealed under the new generation.

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
