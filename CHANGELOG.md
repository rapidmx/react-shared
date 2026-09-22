# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.12.0] - 2026-09-22

### Added
- Added resolveMailboxOwner and resolveEscrowScopeHolder, previewing who a typed address, username, alias or uid names before either field is actually set

### Changed
- Widen DnsRecordType and DnsRecordCheck.recordKind to match restapi's new autodiscover_cname and autodiscover_srv checklist entries
- Document the change in the release notes and NOTES
- Test both new calls
- Document the fix in the release notes and NOTES

## [0.11.0] - 2026-09-22

### Added
- Added an appearance preferences client for a user's colour scheme, theme colours and background image, normalizing anything read from outside and diffing against the server's merge-based PUT so only what changed is ever sent
- Added queueMessageSend for background sending, sendEvents to read the send-succeeded, send-retrying and send-failed push events a background send publishes, and setApiUnauthorizedObserver so one place hears every session-ending 401
- Added an admin-console scope to listMailboxes, listQuarantine, listIngestQueue and getMailbox, so only the admin console reads another user's mail as metadata, and add resolveMailboxPrincipal so sharing can name a person by address, username or uid instead of a raw id
- Added signing certificate progress to EnrollmentResult, its provider, and getCurrentSignEnrollment, checkSignEnrollmentNow and checkNowRetryAfterSeconds for polling a request against a CA
- Added a signing certificate provider client for the deployment's issuance backend and health, and for an administrator's list, CSR download, certificate upload and rejection of a pending request
- Added purgeData to removePlugin, retryPluginPurge, and the plugin purge status fields a client needs to show progress

### Changed
- Test every addition above and document the changes in the release notes and NOTES

## [0.10.0] - 2026-09-21

### Changed
- Load x509, hash-wasm and the S/MIME code on first use instead of at import, awaiting reflect-metadata first, so the bundles that only read mail don't ship the PKI libraries
- Document the change in the release notes and NOTES, including that web-client's inbox route is 467 KB rather than 1.05 MB only with this release
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>


## [0.9.0] - 2026-09-20

### Added
- Added CopyButton, copyTextToClipboard and useCopyToClipboard, with a hidden textarea fallback for when the async clipboard is unavailable
- Added a push client with one connection per tab, reconnects with backoff, re-subscription to the folders it is given and a close on sign-out, for live mail updates
- Added formatMailAddress and splitMailAddress, which always show the real address and quote a display name that is itself a different address
- Added describeSendFailure and keep the parsed response body as ApiRequestError.details, so a compose window can show a failed send's technical details
- Added getMyUsername, the first verified name alias, so the account menu can show it when a profile has no name

### Changed
- Show recipient addresses in a forward's quoted header
- Test the new modules and the changed ones
- Document the changes in the README, the release notes and NOTES, including that web-client needs this release before its own
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>

## [0.8.0] - 2026-09-20

### Added
- Added an optional defaults to MailboxPolicy, the server's config value of each field, for a reset to server default control on the mailbox policy form

### Changed
- Keep it optional so a UI offers no reset against an @rapidmx/restapi that predates it, and leave it out of what updateMailboxPolicy accepts
- Document the change in the release notes and NOTES, including that it needs the next @rapidmx/restapi release
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>

## [0.7.0] - 2026-09-17

### Added
- Added mail/directoryApi with searchDirectory and searchContactSuggestions over restapi's GET /mail/directory and GET /mail/directory/contacts, for compose recipient autocomplete
- Added fetchRecipientSuggestions, which runs both searches, keeps one source's entries when the other fails and rethrows aborts, and mergeRecipientSuggestions, which lists contacts first without repeating an address
- Added mail/messageBodySanitizer.ts, web-client's own client-side body sanitizer moved here so a quote is cleaned the same way a displayed body is: sanitizeMessageBodyHtml for display, sanitizeQuotedHtml for a quote (also no styles, forms, frames, media or image that isn't a data: URI), and stripRemoteCssUrls, all of which drop every remote resource reference
- Added buildComposeBodyHtml, which lays out a compose body as Outlook and Gmail do: an empty paragraph for the caret, then the signature, then the quote
- Added buildReplyRecipients, which resolves a reply's To and Cc without the replying mailbox's own addresses, without repeating an address and without carrying Bcc recipients over, keeping display names - Reply All adding the original To to To and the original Cc to Cc, and a reply to a message the mailbox sent itself going to its original recipients
- Added recipientDisplayName, which drops the address a display name carries, since an ingested message's from holds its whole From header as the display name
- Added sortBy, sortOrder and filter to listMessages, typed as exactly the sort keys and named filters @rapidmx/restapi accepts, and stop sending an explicit newest-first sort now that the server defaults to one with a stable tiebreaker
- Added bulkUpdateMessages, with setMessagesRead, setMessagesFlagged, moveMessages and setMessagesLabels over it, chunked at MAX_BULK_MESSAGE_UPDATE and stopping at the first rejected chunk, plus single-message setMessageFlagged and moveMessage
- Added listConversationMessages for the expanded children of a conversation row, resolving a real thread or a single message that belongs to none
- Added the server-managed read, flagged, fromAddress and importanceRank mirrors to the Message type, documented as fields to read through flags, from and importance instead
- Added labelUids to listMessages and listConversations, the Label.uids a mail list is filtered by, sent as one comma-separated parameter and typed as a string array
- Added MAX_MESSAGE_LABEL_FILTER, mirroring the server's own cap, so a label menu offering multiple selection can stop the user rather than send a request the server refuses with a 400
- Added buildReplyThreading, which returns the inReplyTo and references a reply must record - the replied-to message's own messageId, and its references chain with that messageId appended, never repeating it and trimmed from after the thread's root to MAX_REPLY_REFERENCES entries

### Changed
- Skip the request for a query shorter than 2 characters and cut one longer than 100
- Test the suggestion clients and merging
- Document the suggestion API in the release notes and NOTES
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Quote a replied-to or forwarded message's full body, passed to buildReplyQuote and buildForwardQuote as a QuotedBody (the sanitized HTML body, the decrypted or verified content, or the plain text), instead of the server's truncated bodyPreview, which is now only the fallback
- Return an empty string, never the unsanitized input, where there is no DOM to sanitize with
- Name the sender as Name <address> in the reply attribution line
- Test the quote builders, the body layout, the reply recipients and the sanitizer
- Document the reply and forward composition API in the release notes and NOTES
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Accept folderUid, filter, limit and page in listConversations, and report the flagged, latestMessageUid, latestFrom, latestPreview and latestFolderUid a collapsed conversation row shows
- Ask the server for flagged messages in listFlaggedMessages instead of reading every message in every folder and filtering in the browser
- Test the new parameters, the bulk helpers and their chunking, and both conversation endpoints
- Document the additions in the release notes and NOTES
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Document the semantics @rapidmx/restapi implements: a message is listed when it carries any of the named labels, ANDed with filter, order-insensitive and ignoring duplicates, applied by the database over the whole folder before paging and, for conversations, to the messages before they are grouped
- Send no parameter at all for an empty selection, so a filter menu with nothing ticked issues exactly the request it always did
- Point a caller building that menu at listLabels in mail/labelsApi, which already exists - labels are per-mailbox, so a uid from another mailbox matches nothing
- Test both endpoints' new parameter and its empty case
- Document the addition in the release notes and NOTES
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Open a reply with an empty paragraph immediately above the quoted original, on top of the one that already separates the quote from a signature, so there is a blank line to press Enter into above the "On ... wrote:" block instead of having to make room for it by hand
- Leave a compose body that has a signature and no quote exactly as it was, since the extra line is about the quote
- Accept that threading in createDraft and send it in the draft it creates, so @rapidmx/restapi can write the In-Reply-To and References headers of the message it relays and file the reply into the conversation it continues
- Document that a compose UI opening a reply or forward must pass it, because the MIME is composed from the recipients, subject and HTML alone and nothing recovers the thread afterwards - a reply created without it is relayed carrying no threading headers, so every recipient and the sender's own Sent Items copy start a new conversation for it
- Expose inReplyTo, references and the server-assigned conversationId on Message, which a client needs to build a reply's chain and had no way to read
- Test the new body layout, the threading builder's chain, deduplication, trimming and blank entries, and both createDraft forms
- Document all of it in the release notes and NOTES
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

## [0.6.0] - 2026-09-15

### Changed
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

### Removed
- Removed bookingApi, which moved to @rapidmx/booking-plugin

## [0.5.0] - 2026-09-15

### Added
- Added searchPlugins, getPluginUpdates and listPluginNamespaces to pluginsApi for finding plugins in the configured namespaces and checking installed plugins for updates
- Added planPluginChange() and PluginChangePlan for GET /system/plugins/plan
- Added requires to PluginManifest
- Added expectedPlan to addPlugin() and UpdatePluginInput, and expectedPlanOf() to build it from a previewed plan, so the server can refuse a change whose dependencies differ from what was confirmed
- Added the custom role and actions to listed mailbox access members, and allowed to PluginUpdateInfo, matching restapi
- Added getMyMailboxAccess() for GET /mail/mailboxes/:id/access/me, the caller's own effective access to a mailbox
- Added null in updateRetentionPolicy() to clear a retention period, matching restapi
- Added mailboxScopedData to PluginManifest, matching restapi
- Added scheduled-send retry fields, missing status union values and processing attempts, pinned signing fingerprint helpers, and VaultAlreadyInitializedError for enrollKey conflicts
- Added cancelSignEnrollment for restapi's new owner cancel endpoint, and document that rekey needs a replacement escrow wrap for escrowed mailboxes and is refused while a sign enrollment is in flight
- Added optional expectedMasterKeyGeneration to enrollKey, startSignEnrollment, rekey and addMasterKeyWrap, and masterKeyGeneration to KeyVault
- Added unlockWithRecoveryCode, which tries each recovery code wrap and opens the session like password unlock, reporting the used code and how many remain
- Added consumeRecoveryCode and replacePasswordWrap, which replaces a forgotten password wrap safely and restores the old wrap if adding the new one fails
- Added trustSigner for pinning an unpinned sender's signing certificate, with SignerKeyConflictError for a different pinned key, and expose signerCertificate on verified and unverified-signer results
- Added resolveKeyConflict with PinnedKeyChangedError, and fetchSignerKeyState and signerKeyStateFor for key-changed comparisons without discovery
- Added decryptEnvelopedDataWithKeys and parseEncryptedMessageWithKeys, bounding retained keys and trial decryptions
- Added verification seals: an HMAC keyed per mailbox from the master key over the verified signer, result, raw content hash and master key generation, written once per generation
- Added evaluateMessageSecurityWithSeal, which returns a seal to store after live verification and reports verified_at_first_open, with a laterCompromised warning, when only the signer key's status has since changed
- Added setMessageVerificationSeal with VerificationSealConflictError and Message.verificationSeal and verificationSealGeneration

### Changed
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Return { plugin, dependencies } from addPlugin()
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Include the previewed plugin version in expectedPlanOf()
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Reject S/MIME detached signatures that carry their own content, use the certificate pkijs matched to the signature instead of the first one, fail pin checks closed, and require the signer certificate's email to match the From address
- Only decrypt AES-GCM S/MIME content, and parse MIME properly: folded headers, preambles, unquoted boundaries and base64 or quoted-printable bodies
- Expand recurring events in the event's time zone, keep local times when dragging events across days, and detach one occurrence by creating it first while keeping the meeting identity
- Honour subject: and has:attachment in encrypted search with limited decrypt concurrency, pass a mailboxUid to search, and read date-only search bounds as local midnight
- Use apiUrl() with credentials for every raw fetch, page flagged messages and calendar events, and add list paging params to request list wrappers
- Send minimal contact patches, add escrow scope and federated receipt mailbox fields, allow null to clear mailbox fields, and add apply_label and matter export audit actions
- Import unwrapped private keys as non-extractable, zero the master key on destroy, detect idle time across sleep and iframe focus, add subscribeKeySession(), and normalize recovery code input
- Trap focus in modals and drawers and let only the topmost overlay handle Escape
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Base64-encode the signed body of S/MIME signed-only messages so MTA line rewrapping can't break the signature
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Refuse to seal, open or derive with a destroyed or all-zero master key via KeysLockedError, and drop private key handles when keys are destroyed
- Expand all-day recurring events in UTC, keep all-day drags on whole dates, use the pre-transition offset in DST gaps, and shift exceptions and detached occurrences when a series moves
- Treat duplicate From, To, Cc or Sender headers as header tampering, refuse identity binding for malformed SANs, and flag messages not addressed to the reader
- Strip CR, LF and NUL from generated headers and RFC 2047-encode non-ASCII subjects and names
- Read raw MIME as bytes and apply part charsets, decode quoted-printable linearly, and strip HTML for encrypted search in a single capped pass
- Page flagged messages with caps and dedupe, keep newer overlays on top, fix vCard escaping, unfolding and group prefixes, and add escrow audit verify reasons and new model fields
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Schedule a send through sendMessage's scheduledSendTime option, since restapi no longer lets a PUT set scheduledSendTime, and remove setMessageScheduledSendTime
- Document that moving a message out of Outbox cancels its scheduled send server-side
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Only report a signature as verified when the signer matches a pinned or own signing fingerprint, returning signed_unverified_signer or encrypted_unverified_signer with the signer's fingerprint and emails otherwise
- Require exactly two parts in multipart/signed, expose protected headers and inner attachments, and flag protected Cc and Subject mismatches
- Skip unopenable signing keys on unlock and report them, failing with UnopenableEncryptionKeyError only for the encryption key
- Destroy every key object handed out for a mailbox on lock, and abort unlocks, rewraps and tier-3 searches that a lock overtakes
- Shift DST-gap recurrence exceptions by wall-clock time, decode quoted-printable consistently, keep address group syntax, and split vCards only at line starts
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Hold handed-out key objects weakly so replaced master keys aren't kept alive until lock, while every reachable object is still destroyed on lock
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Replace Contact.keyConflict with keyConflicts carrying the observed key, and add previousKeys, rejectedKeys, issuerCertificate and revocationReason to the key types
- Trust previous and superseded signing keys for verification while never trusting compromised or reasonless revoked keys, via isTrustedForVerification
- Report a valid signature from a pinned sender with a different key as signer_key_changed with its certificate
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Open retained encryption keys on unlock and decrypt with the key matching each recipient slot, so mail encrypted to a superseded or older key stays readable
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

### Fixed
- Fixed lint errors: a duplicate keyvaultApi import and unnecessary type assertions

### Removed
- Removed the unused rewrapPrivateKeysUnderNewMasterKey, which dropped retained key wraps

## [0.4.0] - 2026-09-14

### Added
- Added mailboxAccessApi.ts: client wrapper for the new mailbox access management/email-lookup routes
- Added per-mailbox calendar accent colors
- Added deleteMessage() wrapper
- Added pluginsApi for the admin console: list plugins and their per-server status, preview a package from the registry, and add, upgrade, configure, enable, disable and remove plugins
- Added generateEscrowKeyPair, which creates an escrow scope's P-256 key and self-signed certificate in the browser and returns the certificate as a scope public key plus the PKCS#8 private key for the administrator to download
- Added a test proving a holder with the downloaded private key can unwrap a master key escrowed to the generated certificate
- Added setupApi for the first-run setup wizard state (read, save the current step, complete, reopen) and mailboxPolicyApi for the new deployment-wide mailbox policy

### Changed
- listMailboxAccess/setMailboxAccess/removeMailboxAccess/lookupMailboxOwnerByEmail
- wrap @rapidmx/restapi's new BaseMailboxAccessRoute - a friendlier, viewer/manager
- layer over mailbox delegate access than this package's existing raw
- getMailboxAcl/grantMailboxAccess/revokeMailboxAccess (which stay untouched for
- their one existing caller, the admin-only ShareAccessCard).
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- accentColorForMailbox() hashes a mailbox uid to a stable palette color
- (never the default blue), and colorForFolder() takes an optional fallback so
- a shared mailbox's uncolored calendar can render in its mailbox's color
- instead of the same default as the caller's own. Explicit folder colors
- still win.
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Used by compose to discard an unsent draft when the sender mailbox changes.
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Change the branding, retention policy and encryption policy clients to the system/ API paths, where deployment-wide settings now live
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

## [0.3.0] - 2026-09-13

### Added
- Added src/crypto/, the client-side cryptographic foundation for specs/end-to-end_encryption.md's Keypair Generation and Master Key Wrapping sections, shared by web-client and electron-client
- Added masterKey.ts implementing master-key generation, AES-256-GCM AEAD seal/open with mailboxUid+purpose bound as additional authenticated data, and HKDF-SHA256 derivation
- Added passwordUnlock.ts deriving an Argon2id output via hash-wasm and HKDF-splitting it into an auth proof and a device-only wrapping key, never reusing one value for both purposes
- Added recoveryCode.ts generating CSPRNG recovery codes in a dash-grouped Crockford base32 format and deriving their wrapping key via HKDF
- Added passkeyUnlock.ts deriving a wrapping key from the WebAuthn PRF extension via the raw navigator.credentials API, deliberately not @simplewebauthn/browser since this credential is used purely as a local KDF input with no server-verified ceremony
- Added keys.ts generating P-256 ECDSA keypairs and PKCS#10 CSRs via @peculiar/x509, with export/import helpers proving the same key material re-imports under ECDH for actual key-agreement use
- Added keyvaultApi.ts, typed wrappers over @rapidmx/restapi's key-vault, key-lookup, and encryption-policy endpoints
- Added @peculiar/x509, hash-wasm, and reflect-metadata dependencies
- Added smime.ts, the CMS engine behind specs/end-to-end_encryption.md's S/MIME message-format requirement
- Added signDetached()/verifyDetached() building and verifying detached CMS SignedData via pkijs, embedding the signer's certificate per the spec rather than sending it separately
- Added encryptForRecipients()/decryptEnvelopedData() building and decrypting CMS EnvelopedData with AES-256-GCM content encryption, trying every recipient slot in turn since EnvelopedData doesn't label which one belongs to the caller
- Added pkijs and asn1js dependencies
- Added test/crypto/smime.test.ts covering real sign/verify/encrypt/decrypt round-trips (including multi-recipient encrypt-to-self) against real @peculiar/x509-generated certificates, tamper detection, and every malformed-input path
- Added signOpaque()/verifyOpaque() to smime.ts, an opaque (content-embedded) CMS SignedData variant needed for the sign-then-encrypt case, where the signed content gets immediately encrypted so no legacy client is ever exposed to the intermediate signed layer
- Added smimeMessage.ts, MIME assembly around smime.ts's CMS primitives implementing specs/end-to-end_encryption.md's RFC 9788 header-protection requirement
- Added buildSignedOnlyMessage()/parseSignedOnlyMessage() for detached multipart/signed with hp="clear"
- Added buildEncryptedMessage()/parseEncryptedMessage() for pkcs7-mime enveloped-data with hp="cipher", supporting both encrypt-only and sign-then-encrypt (via smime.ts's opaque signing) in one function
- Added applyBaselineOuterHeaders(), implementing RFC 9788's own required-minimum hcp_baseline policy
- Added test/crypto/smimeMessage.test.ts covering full round-trips for all three message shapes (signed-only, encrypted-only, signed-then-encrypted with encrypt-to-self), tamper detection, and every malformed-input path
- Added Mailbox.encryptPreference/keys, Contact.encryptPreference/keys/keyConflict, and Message.encrypted, mirroring @rapidmx/restapi's own models - needed by the upcoming compose/message-view E2E wiring to read a recipient's discovered keys, a mailbox's own enrolled keys, and whether a received message is encrypted
- Added assembleDraftRaw(), the client wrapper for server's new BaseMailComposeRoute.assembleRaw() endpoint - stores an already-signed/encrypted draft's raw MIME source, the E2E counterpart to assembleDraft()'s own HTML-composition path
- Added key session unlock module (crypto/keySession.ts)
- Added compose-time encryption/signing decision logic (crypto/composeSecurity.ts)
- Added message-view decrypt/verify logic (crypto/messageSecurity.ts)
- Added crypto/keyRotation.ts for real key-vault revocation
- Added idle-timeout key destruction (crypto/idleTimeout.ts, useIdleKeyTimeout.ts)
- Added RFC 9788 HP-Outer tamper detection on receipt
- Added Message.listUnsubscribeHeader for client-side mailing-list detection
- Added search query-grammar parser (specs/search.md section 14)
- Added client-side search score normalization
- Added Tier 3 server-assisted narrowing over encrypted mail (specs/search.md)
- Added archiveMessage() wrapping restapi's new POST /mail/messages/:id/archive
- Added labelsApi.ts CRUD wrapper for restapi's new Label entity
- Added Message.labelUids and setMessageLabels() to mailApi.ts
- Added startSignEnrollment/checkSignEnrollmentStatus wrappers over restapi's new RFC 8823 ACME signing-certificate enrollment endpoints
- Added SignEnrollmentRequest/EnrollmentResult types mirroring restapi's wire contract exactly
- Added tests for the two new keyvaultApi functions, matching existing describe-block conventions
- Added getEscrowInfo() wrapper over server's new mailbox-owner-readable escrow proxy route
- Added buildEscrowWrap(), wrapping MK as a CMS EnvelopedData against an escrow scope's public certificate via encryptForRecipients()
- Added round-trip tests confirming a holder can unwrap with the matching keypair and not with a different scope's
- Added escrowScopeId to the Mailbox interface, for Settings UI to detect an assigned escrow scope
- Added escrowScopesApi.ts: full CRUD wrapper over restapi's trusted-admin-only EscrowScope route
- Added mattersApi.ts: CRUD wrapper over the holder-gated Matter route plus closeMatter()
- Added escrowAccessRequestsApi.ts: create/approve/deny/getAccessRequestMaterial over the bespoke EscrowAccessRequest route
- Added escrowAuditLogApi.ts: read-only list/get plus verifyAuditChain() over the append-only audit log route
- Added retentionPolicyApi.ts: get/update the deployment-wide singleton RetentionPolicy over mail/retention-policy
- Added dataExportApi.ts: create/list/get a GDPR data-export request, plus a plain download-URL builder over mail/data-export-requests
- Added mailboxImportApi.ts: raw-bytes upload of an Mbox/PST archive plus list/get over mail/mailbox-import-requests
- Added erasureRequestApi.ts: self-service create plus admin approve/deny over mail/erasure-requests
- Added admin/matterExportApi.ts, a typed wrapper over restapi's Matter export requests at escrow/matter-export-requests
- Added admin/matterSearchApi.ts, a typed wrapper over restapi's Matter-scoped search at escrow/matter-search
- Added tokenizeFreeText()/groupByOr(), replacing a naive whitespace split that treated a quoted phrase as separate AND-ed words and a -negated term as a literal required word
- Added tests for quoted phrases, negation, OR, a literal quoted "OR", a bare OR with nothing real on either side, and an empty quoted phrase
- Added a pinning test asserting two different-content candidates get an identical score for an all-negated query, so a future change can't silently make this asymmetric between tiers

### Changed
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Document the crypto/ addition and its cross-repo consequences in NOTES.md
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Simplify verifyOpaque()'s content extraction after confirming, via a deliberate detached-signature-into-verifyOpaque test, that eContent is unconditionally present whenever verification succeeds through this function's own no-external-data contract - removes a defensive branch for a case that can't occur, rather than leaving untestable dead code
- Relax vitest.config.ts's branches threshold from 99 to 98, documenting three additional justified, individually-commented unreachable branches in smime.ts alongside the pre-existing useBranding.ts one
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Fetch and verify RFC 9788's actual text before implementing, rather than assuming from memory - its real mechanism (protected headers as literal header lines on the signed/encrypted content's own entity, an hp="clear"/"cipher" Content-Type parameter, HP-Outer: field copies, outer Subject obscured to "[...]" under the required hcp_baseline default) is materially different from the RFC 8551 §3.1 message/rfc822 wrapping the spec explicitly forbids, and from what a naive guess would have produced
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Replace new pkijs.CryptoEngine({...}) with the raw (crypto, crypto.subtle) three-argument form for setEngine() - pkijs's own CryptoEngine class doesn't actually satisfy its own ICryptoEngine interface (an Ed25519/X25519 generateKey overload mismatch in pkijs's own type definitions), so constructing one only to pass it in fails to compile even though it behaves correctly at runtime
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Bridges Phase 2's key provisioning to actual usable CryptoKey objects
- needed by compose/message-view work: unlockWithPassword() fetches the
- key vault, derives the wrapping key via the exact KDF parameters the
- password wrap was created with (parseArgon2idKdfLabel, the inverse of
- the existing argon2idKdfLabel), unwraps the master key, then unwraps
- and imports the mailbox's currently-active signing/encryption private
- keys into an in-memory-only session store (never localStorage/IndexedDB,
- per the spec's "destroyed on explicit logout" requirement).
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Pure decision functions for the compose window's sign/encrypt behavior per
- end-to-end_encryption.md's Digital Signatures and Encryption sections:
- classifyRecipientTier() approximates the spec's same-org/federated/external
- tiers (restapi 0.6.0 exposes no tier field on key lookups, so this is a
- documented domain-suffix approximation), resolveRecipientEncryption() applies
- the per-tier policy state plus the "both parties advertise mutual" rule to
- one recipient, and decideMessageEncryption() combines all recipients into
- the toggle default + all-or-nothing block list the spec's "Multiple
- Recipients" section requires.
- Also moves findActivePublicKey() out of keySession.ts and into keyvaultApi.ts
- so composeSecurity.ts can share it instead of duplicating the same
- active/non-revoked/non-expired key selection logic.
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- evaluateMessageSecurity() reads a received message's raw MIME (fetched via
- mailApi.ts's new getMessageRawContent(), against server's new raw-content
- route) and classifies it into one of specs/end-to-end_encryption.md's five
- Message Security Indicator states, decrypting/verifying via smimeMessage.ts
- as needed: unprotected (no recognized S/MIME Content-Type), signed_verified
- (multipart/signed, valid), encrypted/encrypted_verified (pkcs7-mime
- enveloped-data, decrypted, with or without a verified inner signature), and
- signature_failed (present but invalid, or - when a pinned fingerprint is
- supplied - valid but not matching it).
- Trust Model gap, disclosed not silent: no caller supplies a pinned Contact
- fingerprint yet (Contact key-pinning UI is Phase 4's "Discovery & contacts
- UI" work), so every signature checked today is only proven mathematically
- self-consistent, not yet checked against a TOFU-pinned identity.
- Also adds smime.ts's computeCertFingerprint() (SHA-256 of DER, hex-encoded
- to match keyvaultApi.ts's own PublicKey.fingerprint format) for that pinned
- comparison, exports smimeMessage.ts's splitHeadersAndBody() so this module
- can read a received message's own outer Content-Type, adds the assembleOutboundMime()
- helper (outer envelope headers + a MimePart's Content-Type/body, serialized into
- one RFC 5322 source) compose already needed, and adds the dompurify dependency
- this module's eventual caller (MessageDetailPane.tsx) will use to sanitize a
- decrypted body before rendering it - the server-side sanitize-html pass never
- runs against ciphertext it can't read.
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Document the CMS/S-MIME engine, compose decisions, and message-security work in NOTES.md
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Extract master-key wrap construction into crypto/masterKeyWraps.ts
- buildPasswordWrap()/buildRecoveryWraps() were previously inlined only in
- web-client's KeyEnrollmentGate.tsx (first-sign-in provisioning). Extracted
- so the upcoming Settings page's "add a password method"/"regenerate
- recovery codes" actions - which wrap an already-unlocked MK a second time,
- not a freshly generated one - can reuse the exact same wrap-construction
- logic instead of a second, potentially drifting copy of it.
- buildPasswordWrap() now takes an optional Argon2id params override (tests
- only; production callers omit it and get the module's own recommended
- default) - the same pattern deriveFromPassword() itself already uses.
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- rewrapPrivateKeysUnderNewMasterKey() generates a fresh master key and
- re-wraps whichever of a session's already-unlocked private keys exist
- under it, using the exact same key material and AAD purposes keySession.ts
- itself uses - the same underlying keypair/certificate is reused unchanged,
- only its protection changes. Pairs with keyvaultApi.ts's existing rekey()
- (full atomic vault replacement) as the actual client-side half of "the
- only real revocation mechanism for a captured wrap".
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- useIdleKeyTimeout() destroys every unlocked mailbox's in-memory keys after
- a configurable idle period with no user activity - the spec's own
- "destroyed on ... a configurable idle period" trigger for keySession.ts's
- destroyUnlockedKeys(). Listens at the document level (mousedown/keydown/
- scroll/touchstart) rather than scoping to any one app's content area, so
- activity anywhere in the client resets the clock, not just in Mail or
- Settings where the unlocked keys are actually read/used.
- idleTimeout.ts stores the configured duration in localStorage - a
- per-device preference, never synced, matching keySession.ts's own
- never-persisted-durably posture for the keys this setting protects.
- Defaults to 30 minutes for a never-configured device; 0 disables the
- timer entirely.
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Bring searchApi.ts up to restapi's actual operator-grammar interface
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Surface recovered real subject on MessageSecurityResult
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Document Phase 4 of consuming restapi's 11 post-0.6.0 commits in NOTES.md
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Use fixed documented placeholder nonce/salt values and a cms-enveloped-data kdf label, since CMS EnvelopedData is already self-contained
- Document Phase 5b (mailbox-owner wrapping) of consuming restapi's 11 post-0.6.0 commits in NOTES.md
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Document Phase 5c (admin/holder API wrappers) of consuming restapi's 11 post-0.6.0 commits in NOTES.md
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Document a latent fromBase64("n/a") fragility in the escrow wrap's placeholder nonce/salt fields, found during an adversarial review pass
- Document the review's findings and the web-client-side key-rotation fix in NOTES.md
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Document Phase 3 (Retention Policy) of consuming restapi's next batch in NOTES.md
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Document Phase 4 (GDPR data export) of consuming restapi's next batch in NOTES.md
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Document Phase 5 (mailbox import) of consuming restapi's next batch in NOTES.md
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Document Phase 6 (GDPR erasure) of consuming restapi's next batch in NOTES.md
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Export search/searchApi.ts's previously-private buildSearchParams() so matterSearchApi.ts reuses the same operator-grammar query-param logic
- Document Phase 7 (eDiscovery: Matter export + Matter-scoped search) of consuming restapi's next batch in NOTES.md
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Share a positiveTermTexts() helper between countTermOccurrences() and buildSnippet() so scoring and snippeting stay consistent with what actually matched
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Document why an all-negated free-text query (e.g. -spam -junk) giving every Tier 3 candidate the same flat score is intentional, not a bug
- Verify directly against restapi's PostgresFullTextSearchProvider that Tier 1's own ts_rank degrades identically for the same query shape, so both tiers tie together rather than Tier 3 being one-sidedly disadvantaged
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Updates release notes

### Fixed
- Fixed a real gap found while testing: constructing SignedData from an untrusted schema can throw on a structurally-valid-BER-but-wrong-shape blob, not just a genuinely unparseable one - wrap both that and verify() in the same catch so a malformed CMS blob always degrades to a failed-signature result, never a thrown error
- Fixed a real bug found via a standalone reproduction: eContent must be read through OctetString.getValue(), not .valueBlock.valueHexView directly - eContent commonly round-trips as a *constructed* OctetString (an outer wrapper around inner primitive chunks, standard per RFC 5652), and reading the raw value block silently returns empty bytes for that shape
- Fixed a real pre-existing type error in smime.ts, only caught by running tsc --noEmit directly (vitest's esbuild-based transform strips types without validating them, so this had been silently passing tests since it was first written)
- Fixed Tier 3 free-text matching to honor quoted phrases, - negation, and OR the same way Tier 1's provider already does

### Removed
- Removed two defensive checks that turned out unreachable given the tokenizer regex's own structure, rather than writing untestable coverage for them

## [0.2.0] - 2026-09-11

### Added
- Added the api client/hooks layer extracted verbatim from rapidmx/server's apps/shared/lib
- Added repo scaffolding (tsconfig, vitest, eslint config) for publishing this as @rapidmx/react-shared
- Added the eslint config this repo's own lint script has referenced since it was first scaffolded
- Added configureApiBaseUrl() so apiFetch() can target a real absolute origin instead of a relative path
- Added supporting files
- Added components/ (buttons, feedback, forms, overlays, avatar, pickers, navigation) with Button, Alert, Skeleton, FormField, PopoverPortal, ContactAvatar, MiniDatePicker, and BottomTabBar moved in from web-client
- Added date-fns and react-icons dependencies for MiniDatePicker and BottomTabBar
- Added tests for Button, Alert, Skeleton, and FormField, which had none

### Changed
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Every consumer import already carries the NodeNext-style .js extension (e.g. mailApi.js), so the
- previous "./*": "./dist/*.js" pattern resolved to a literal dist/mailApi.js.js that never existed.
- Confirmed against a real consumer (rapidmx/server, portal-linked) - both Vite's build and vitest's
- SSR resolution now find every subpath correctly.
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Copied from postfix-bridge/ses-bridge's shared config - missed in the initial scaffold, so `yarn lint`
- had no config file to find until now.
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Every existing consumer (the SSR web/admin apps) is served from the same origin as the API it calls and
- never needed this - apiFetch() was hardcoded to a same-origin relative /api path. A consumer whose own
- origin genuinely differs from the RapidMX server - the electron-client desktop shell's renderer, which
- has no "same origin as the server" to rely on - needs an explicit absolute origin and credentials:
- include, mirroring the pattern authApiFetch() already has for auth-server calls.
- Fully backward compatible: unset (the default), apiFetch()'s behavior is unchanged - verified via this
- package's own test suite, same 295 tests plus 4 new ones for the configured-base-URL behavior.
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Reorganize src/ and test/ into feature folders (util, auth, branding, admin, mail, calendar, contacts, tasks, booking, search), mirroring restapi's own layout
- Configure the test environment's timezone to UTC for MiniDatePicker's local-time calculations
- Update README and NOTES.md for the new layout
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Cleaning up changelog

### Fixed
- Fixed the subpath exports map to not double-append .js onto specifiers that already include it
- Fixed BottomTabBar's test to use a local fixture instead of importing web-client's own AppShell

[Unreleased]: https://github.com/rapidmx/react-shared/compare/v0.12.0...HEAD
[0.12.0]: https://github.com/rapidmx/react-shared/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/rapidmx/react-shared/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/rapidmx/react-shared/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/rapidmx/react-shared/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/rapidmx/react-shared/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/rapidmx/react-shared/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/rapidmx/react-shared/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/rapidmx/react-shared/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/rapidmx/react-shared/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/rapidmx/react-shared/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/rapidmx/react-shared/releases/tag/v0.2.0
