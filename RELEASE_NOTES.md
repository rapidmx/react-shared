# Release Notes

## Unreleased

## v0.17.0

### Added

- **Admin API for the data a deleted mailbox leaves behind (`admin/leftoverMailboxApi.js`).** `listLeftoverMailboxes({ limit, after })` lists deleted mailboxes that still have data (`{ items: [{ mailboxUid, folderCount, messageCount, erasure? }], next? }`). `eraseLeftoverMailbox(mailboxUid)` files an already approved, permanent erasure and answers the request; poll `getErasureRequest()` until `completed`. `leftoverConflictOf(error)` recognises the 409 that `createMailbox()` answers for an address with leftover data (`mailbox-data-remaining`, or `mailbox-data-erasing` with the running request), and `isErasureSettled(status)` says whether a request will no longer change. `deleteMailbox(uid, version, { erase: true })` also erases the data (administrators only), and `DataSubjectErasureRequest.leftoverOnly` marks requests filed this way. Needs `@rapidmx/restapi` 0.22.0 or later.


## v0.16.0

### Added

- **Event dialog API.** `CalendarEvent` and `CalendarEventInput` gain `description`, `descriptionHtml`, `visibility`, `guestsCanModify`, `guestsCanInviteOthers`, `guestsCanSeeGuestList` and the response-only `redacted`, with `EventVisibility`, `GuestPermissions`, `DEFAULT_GUEST_PERMISSIONS`, `guestPermissionsOf()` and `visibilityOf()`; `requestEventChange()` (`POST /calendar-events/:id/request-change`); `detachOccurrence()` carries them onto the detached event; and `MessageInvite` gains the description, `visibility`, `guestPermissions`, `canRequestChange`, `canRequestInvite` and `changeRequest`. Needs a `@rapidmx/restapi` with the event dialog fields.
- **`calendar/freeBusyApi.js`**: `getFreeBusy()` (`POST /calendar-events/free-busy`) with `availabilityOf()`, `availabilityDuring()`, `summarizeAvailability()`, `withoutOwnBlock()` and `suggestTimes()`; someone whose availability is unknown or hidden is never treated as free.
- **`calendar/eventDescription.js`**: `parseEventDescription()`, `sanitizeEventDescriptionHtml()`, `htmlToPlainText()` and `safeDescriptionHref()`; description HTML is read into an allow-list tree and never rendered as markup.
- **`Mailbox.freeBusyVisibility`** (`domain`, `shared`, `nobody`, `everyone`), `freeBusyVisibilityOf()` and the field on `UpdateMailboxInput`.

- **`calendar/inviteApi.js`**: `getMessageInvite()`, `respondToMessageInvite()`, `removeMessageInvite()`, `proposeNewTime()` and `acceptProposal()` for reading and answering the calendar invitation a mail message carries (a message with none resolves `null`), with the `MessageInvite`, `InviteResponse`, `InviteParticipant`, `InviteScheduleEntry` and `ProposedTime` types - including `canPropose`, `canAcceptProposal`, `reply` (who sent a reply or counter-proposal and what they answered), and the reader's `conflicts` and `schedule` around the meeting. `Message` gains `meetingMethod` and `meetingResponse`, and `ConversationSummary` gains `latestMeetingMethod` and `latestMeetingResponse`. Test the five calls.

- **`deviceTimeZone()` and `timeZoneOptions()` (`util/timeZone.js`)**: the IANA time zone of the device (UTC where the browser cannot say) and the zones a picker can offer. `autoProvisionMailbox()` now sends the device time zone with each call, so a mailbox a user creates for themselves starts in it (needs `@rapidmx/restapi` with `timezone` on `POST /mailboxes/auto-provision`; an older server ignores it and uses UTC).

### Fixed

- **`BottomTabBar` is usable with many items.** Every item took an equal share of the width, so the admin console's ten or so tabs ran their labels into one another on a phone. Each item now keeps a minimum width, its label wraps rather than overlapping, and the bar scrolls sideways, opening with the active item in view. A bar of four items looks as before.
- **`lookupPluginPackage()` sends the package name in the query string** (`/registry?name=@rapidmx%2Fbooking-plugin`) instead of the path, where a proxy such as Envoy Gateway unescapes the `%2F` of a scoped name and redirects to a path that matches no route. Needs a server with `@rapidmx/restapi`'s `GET /registry?name=`.

## v0.15.0

### Security

- Added CSRF (double-submit cookie) protection to `apiFetch()`/`authApiFetch()`: both now echo a `csrf`
  cookie (set by a `@rapidrest/auth`-backed server) back as an `x-csrf-token` header on every mutating
  request, the client-side half of a coordinated fix across `@rapidrest/service-core`, `@rapidrest/auth`
  and `@rapidrest/auth-server`. `stopImpersonating()` also switched from GET to POST — a state-changing
  GET is exploitable via a bare navigation, bypassing CSRF defenses entirely. Needs a server built on the
  updated `@rapidrest/service-core`/`@rapidrest/auth` to actually enforce the check; see those projects'
  own release notes.

## v0.14.1

### Fixes

- **`saveEventSeries()` now shifts exceptions/recurrenceIds on a timezone- or allDay-only edit too (`calendar/calendarMutations.ts`).** Its entry gate previously only entered the wall-clock-shift path when `fields.startDate` was set, even though the function's own doc comment always promised the shift also happens on a timezone/allDay change - a caller that changed only one of those (no `startDate`) would have silently skipped re-pointing the rule's `exceptions` and any detached occurrences' `recurrenceId`s. Not reachable through today's caller (`web-client`'s event modal always supplies `startDate` alongside a genuine allDay/timezone change), but this is an exported function of a shared package.

## v0.14.0

### Security

- **Active signing/encryption private keys are now imported non-extractable (`crypto/keySession.ts`).** They previously were extractable (a stale exemption left over from a consumer removed 2026-09-15), unlike the retained (non-active) encryption keys, which were already non-extractable. A raw-bytes export of a live session key would have survived logout/master-key-zeroing; nothing in this package or its consumers ever called `exportKey()` on one, so nothing depended on the old behavior.
- **`sanitizeMessageBodyHtml()` now forbids `svg`/`math` tags (`mail/messageBodySanitizer.ts`), matching `sanitizeQuotedHtml()`.** It renders a received message's HTML - attacker-controlled content - and DOMPurify's default SVG/MathML allowlist has a history of mutation-XSS bypasses; there was no legitimate reason for the two sanitizing paths to disagree here.

### Fixes

- **`useMessageAttachments` no longer re-fetches on a metadata-only message patch, but still does on a folder move (`mail/mailDetailHooks.js`).** Its effect now depends on `message?.uid`/`message?.hasAttachments`/`message?.folderUid` instead of the whole `message` object: marking a message read (or any other star/flag/label patch that hands the hook a new object reference for the same message) no longer triggers a needless attachment re-fetch, while `moveMessage()`/`archiveMessage()` - which change `folderUid` in that same "new reference, same uid" shape - still correctly re-fetch against the message's new folder.
- **`PopoverPortal`'s outside-click listener no longer re-subscribes on every render (`components/overlays/PopoverPortal.js`).** `onClose` is now read through a ref, like `overlayStack.ts`'s `onCloseRef` - callers (`EmojiPicker`/`GifPicker`) routinely pass a fresh inline function every render, and the `pointerdown` listener on `document` is now added/removed once instead of on every parent re-render.

## v0.13.0

### Features

- **`Domain.aliasOf` (`admin/domainsApi.js`).** `Domain`, `CreateDomainInput` and `UpdateDomainInput` all gain an optional `aliasOf`, naming another domain this one is a pure alias of (`@rapidmx/restapi`'s
  new domain-alias feature) - a domain with `aliasOf` set has no mailboxes of its own; mail addressed to it is delivered to the matching mailbox on the domain it aliases instead.
- **Video meetings client (`videoconf/videoMeetingsApi.js`).** Typed client for `@rapidmx/meet-plugin`'s owner-side `/mail/video-meetings` routes: `createVideoMeeting(input)` (mints a meeting for a mailbox - a `"private"` one needs at least one invitee and answers with each invitee's own personal join link plus the organizer's `organizerJoinUrl`), `updateVideoMeeting(uid, { title?, status? })` (rename, or `status: "cancelled"` - the route deliberately cannot change a meeting's invitees), `getVideoMeeting(uid)` and `listVideoMeetings(mailboxUid, params?)` (a mailbox's own meetings, each with the same `organizerJoinUrl`/`publicJoinUrl` a single read gives). `VideoMeeting` also carries `dateCreated`. Ordinary `apiFetch()` calls like every other route: same cookie, same configured origin, same `ApiRequestError`. Where the plugin isn't installed its routes aren't mounted, so a call fails with a 404 that a caller offering video conferencing optionally should read as "not available here".
- **`CalendarEvent.videoMeetingUid` (`calendar/calendarApi.js`).** Optional link from an event to the video meeting minted for it, settable on create/update (and cleared with an explicit `null`). No join link is ever stored on the event itself - each attendee's own link is substituted into their own copy of the invitation server-side, and the organizer's comes from `getVideoMeeting()`.

## v0.12.0

## v0.11.0

### Security

- **`?scope=admin` for the admin console (`mail/mailApi.js`).** `listMailboxes()`, `listQuarantine()` and `listIngestQueue()` take an optional `scope: "admin"` and `getMailbox(uid, { scope: "admin" })`
  sends `?scope=admin`: with a trusted, elevated token the server answers every mailbox as administrative metadata only (`Mailbox.shared` is new; the fields it leaves out - keys, out-of-office text, settings - are
  `undefined`) and any mailbox's quarantine / ingest-queue entries, each call audited. Only the admin console passes it: the plain calls return the caller's own and shared mailboxes, an administrator's included,
  because the server no longer lets a trusted role read another user's mail. `getMailboxAcl()` / `grantMailboxAccess()` / `revokeMailboxAccess()` (`/acls`) are refused for a mailbox's ACL unless the caller
  holds full access to it as themselves - use `listMailboxAccess()` / `setMailboxAccess()` / `removeMailboxAccess()` (`mail/mailboxAccessApi.js`), the audited Sharing endpoints.

### Fixes

- **Resolving a mailbox's owner or an escrow scope's key holder before saving it (`mail/mailApi.js`, `admin/escrowScopesApi.js`).** `resolveMailboxOwner()` and `resolveEscrowScopeHolder()` preview who a
  typed address, username, alias or uid names (the same exact-match resolution `resolveMailboxPrincipal()` already used, never a fuzzy search) before either field is actually set, both typed against the
  same `ResolvedPrincipal` shape.
- **DNS record types gain `autodiscover_cname`/`autodiscover_srv` (`admin/domainsApi.js`).** Type-only change matching restapi's widened `DnsRecordCheck` shape, for the DNS setup checklist's two new
  Autodiscover recommendations.
- **Sharing resolves who it grants to (`mail/mailboxAccessApi.js`).** `setMailboxAccess()` names the person by address, username or user id (the server resolves it and stores only the uid; 400 "No user found for ..." otherwise); new `resolveMailboxPrincipal()` previews who it is; `MailboxAccessMember.noEffect` marks an entry that is not a user uid. `Mailbox.accessRole` (`"owner" | "delegate"`) and `isSharedWithMe()` label a shared mailbox.

### Features

- **Signing-certificate progress (`crypto/keyvaultApi.js`).** `EnrollmentResult` gains optional `provider` (`manual` or `rfc8823`), `stage` (`submitted`, `awaiting-challenge`, `challenge-answered`, `validating`, `issuing`, `issued`, `failed`), `stages` (`{ id, label, state: done|active|pending|failed, at? }[]`), `progress` (0-100), `requestedAt`, `updatedAt`, `lastCheckedAt`, `nextCheckAt`, `note`, `errorCode`, `retryable` and, once issued, `issuedAt`, `installedAt` (a job installs the certificate in the mailbox a few minutes after it is issued), `notAfter`, `serialNumber`, `issuer` and `subject` - all optional, so an older server that sends only `status`, `certificate` and `error` still works. New: `getCurrentSignEnrollment(mailboxUid)` (`GET .../keyvault/keys/sign-enrollment`: the mailbox's current or most recent enrollment with its `enrollmentId`, or `null` on 404), `checkSignEnrollmentNow(mailboxUid, enrollmentId)` (`POST .../sign-enrollment/:id/check`: re-checks with the CA now; the server answers 429 with `Retry-After` within about ten seconds of the last) and `checkNowRetryAfterSeconds(err)` (seconds to wait after that 429: the body's `retryAfter`, else 10). `normalizeEnrollmentResult()` reads every answer defensively - an unknown status is `pending`, a field of the wrong type is dropped, `progress` is clamped to 0-100, a step needs an id, a label and a known state - and `checkSignEnrollmentStatus()` now goes through it.

- **Sending in the background (`mail/mailApi.js`).** `queueMessageSend(uid)` calls `POST /mail/messages/:id/send` with `{ "background": true }`: the server checks the message,
  moves it into Outbox and answers `202 { status: "queued", message }` at once, relaying afterwards; it resolves `{ queued: true, message }`. A server that has no queue relays
  first and answers with the message (`{ queued: false }`), and one whose message class has no send job (501) is sent the ordinary way. `sendMessage()` is unchanged.
- **Send outcomes (`mail/sendEvents.js`).** `parseSendEvent(event)` reads the `send-succeeded` / `send-retrying` / `send-failed` push events the server publishes for a message it
  relayed (`{ uid, mailboxUid, subject, recipients, attempt, nextAttemptAt?, error?: { message, details? } }`) defensively (`undefined` for anything else), and
  `describeSendEventError(error, fallback)` turns an event's `error` into the plain message and technical lines `describeSendFailure()` gives a synchronous failure.
- **One place hears "your session ended" (`util/api.js`).** `setApiUnauthorizedObserver(fn)` is called for every `401` answered to `apiFetch()` (not `authApiFetch()`, whose 401
  is a wrong password); it only observes - the request still rejects with the same `ApiRequestError` - and a throwing observer changes nothing.
- **Appearance preferences client (`appearance/preferencesApi.js`).** Typed client for a user's colour scheme, theme colours and background: `getAppearance()`, `saveAppearance(update)` (the
  server merges a partial), `uploadAppearanceBackground(file)` (the raw bytes with the file's own `Content-Type`), `deleteAppearanceBackground()`, `appearanceBackgroundUrl(version)`
  and `parseAppearanceEvent(event)` for the live `AppearancePreferences...` push events. `diffAppearance(server, next)` builds the `PUT` (only what differs, `null` to clear a colour,
  `kind: "none"` rather than `background: null`, never the image), `normalizeAppearance(value)` keeps only well-formed values (colours `#rrggbb`, numbers clamped, an image version made
  of safe characters) from any outside source, and `validateBackgroundFile(file)` says why a picture is refused (PNG, JPEG, WebP or AVIF, up to 8 MB) before anything is uploaded.
- **Uninstalling a plugin with its data (`admin/pluginsApi.js`).** `removePlugin(uid, { purgeData: true })` sends `{ "purgeData": true }` (nothing is sent by default, so an older server is called exactly as before) and now returns `{ purgeScheduled, purge? }` (`{ purgeScheduled: false }` when the server answers with nothing); a server only accepts the flag from an elevated administrator (403 `api-104` otherwise). New `retryPluginPurge(purgeUid)`, `PluginStatus.purges` (`PluginPurgeInfo`: `pending|running|done|failed`, `steps`, `error`, `serversRunning/serversTotal`), and `AddPluginResult.purgeCancelled/warnings` for the deletion an add cancels.

## v0.10.0

### Fixes

- **The PKI, ASN.1 and Argon2 libraries are no longer in every page's initial JavaScript.** `crypto/keys.js` (`@peculiar/x509`, with
  `tsyringe`/`reflect-metadata`), `crypto/passwordUnlock.js` (`hash-wasm`'s Argon2 WebAssembly) and `crypto/masterKeyWraps.js`
  (`crypto/smime.js`, which carries PKI.js and the X.509/ASN.1 libraries, over half a megabyte) load them on first use - when a CSR is
  built, a password is derived, or an escrow wrap is made - instead of when the module is imported, and every shell that can unlock
  keys imports these modules. `reflect-metadata` is awaited first on its own, because `tsyringe` throws "tsyringe requires a reflect
  polyfill" when it evaluates before the polyfill does. Public signatures are unchanged. Without this release, the web client's inbox
  route loads about 1.05 MB of JavaScript instead of 467 KB.

## v0.9.0

### Features

- **A copy-to-clipboard button (`components/buttons/CopyButton.js`, `util/clipboard.js`, `util/useCopyToClipboard.js`).**
  `<CopyButton value label>` is a small "Copy" button for a value someone has to paste elsewhere; `label` is its
  accessible name ("Copy value for the SPF record"). It reports the result in an always-present polite live region beside
  the button - "Copied", or "Couldn't copy" when neither route works - and the message clears itself after two seconds.
  `copyTextToClipboard(text)` tries `navigator.clipboard.writeText()` and, when that is missing (an `http:` origin) or
  rejects (permission denied, the document not focused), a hidden-textarea `document.execCommand("copy")`, restoring focus
  afterwards; it resolves whether it worked and never rejects, and resolves `false` where there is no DOM.
  `useCopyToClipboard(resetMs?)` is the hook underneath (`{ status, copy }`) for a caller that draws its own button; it is
  safe to unmount mid-copy.
- **`getMyUsername(authServerUrl)` (`auth/profileApi.js`)** returns the caller's first verified auth-server `name` alias
  (`GET /api/aliases?type=name`), the display-name fallback for an account whose profile has no name or no profile document
  at all (`/profiles/me` is a 404 for those). It never rejects: a failed call, an unexpected body or no verified name alias
  all resolve `undefined`. `profileInitials()` takes it as an optional third argument, used after the profile's name and
  before the uid.

- **A push client for real-time mail (`mail/pushClient.js`).** `getPushClient()` is the tab's one connection to the server's
  `/push` WebSocket: `setChannels(uids)` subscribes to folder and mailbox uids (kept to `PUSH_MAX_CHANNELS`, 40 - the server
  allows a user 50 in total across every tab), `onEvent()` delivers each event normalised to `{ type, action, data, channel? }`
  (the server's own `{ type, action, data }` frames and the `{ type: "MESSAGE", channel, data }` wrapper alike; a message
  event's `data` is the whole `Message`, with its `folderUid`), `onStatus()` reports `connecting`/`open`/`reconnecting`/`closed`,
  and `close()` ends it for good (sign-out). It reconnects by itself with exponential backoff and jitter (1 s doubling to 60 s,
  forgotten only once a socket is greeted, not merely opened), re-subscribes each time, and does nothing where there is no
  `WebSocket` or origin. `pushUrl()` is `<api origin>/push` on `ws:`/`wss:`. Events are never replayed, so a consumer must also
  poll and refetch after a reconnect. `PushClient` is exported for a consumer that wants its own.
- **`formatMailAddress()` / `splitMailAddress()` (`mail/mailAddress.js`).** `formatMailAddress({ displayName | name, address })`
  is `Name <address>`, or the bare address with no distinct name; a name with a comma, quote, angle bracket, backslash or `@`
  (or a look-alike of one) is quoted, invisible and bidirectional-override characters are dropped, a name that is the whole
  From header (name plus the sender's own address in angle brackets, which an ingested message can carry) is reduced to the
  name, and the real address is always present and last, even when the name is a different address. `splitMailAddress()` gives
  the `{ name?, address }` parts for a UI that lays them out itself.
- **`describeSendFailure(err, fallback)` (`mail/sendFailure.js`)** turns a failed send into `{ message, lines }`: the
  server's message and one `key: value` line per fact in the error body's `details` (per-recipient results, a transport error),
  read defensively since the shape isn't fixed, capped at 50 lines of 500 characters, and no lines when there are none.
- **`ApiRequestError.details`** keeps the whole parsed JSON body of an error response (`undefined` when there was none), so a
  caller can read what an endpoint says beyond its `message`/`code`. The extra constructor argument is optional. `apiOrigin()`
  returns the origin `configureApiBaseUrl()` set.
- **A forward's quoted header (`buildForwardQuote()`) lists each To recipient as `Name <address>`**, not the name alone.

### Documentation

- `util/api.js` no longer says there is no way to elevate: a `@RequiresElevation()` endpoint answers a non-elevated token
  with a 403 whose `ApiRequestError.code` is `"api-104"` (`"api-103"` is the different "not permitted" 403), and the caller
  sends the browser to auth-server's `/auth/elevate?return_to=`, as `@rapidmx/web-client`'s `AdminShell` now does.

## v0.8.0

### Features

- **`getMailboxPolicy()`/`updateMailboxPolicy()` expose the server's config values (`admin/mailboxPolicyApi.js`):**
  `MailboxPolicy` gains an optional `defaults`, the config value of each field, for a "reset to server default" control.
  It is absent from a server that predates it, so a UI must offer no reset then rather than assume it. `updateMailboxPolicy()`'s
  patch does not accept it. Needs the next `@rapidmx/restapi` release.

## v0.7.0

### Features

- **A reply opens with a blank line above the quote (`mail/compose/composeQuoting.js`).** `buildComposeBodyHtml()`
  now puts an empty paragraph immediately above the quoted original, on top of the one that already separates it from
  a signature - so a reply opens as the caret's own line, the signature, a blank line, another blank line, then the
  "On ... wrote:" block, and there is somewhere to press Enter into above the quote without making room by hand. A
  body with a signature and no quote is unchanged.
- **Reply threading (`mail/compose/composeQuoting.js`, `mail/mailApi.js`).** New `buildReplyThreading(message)`
  returns the `inReplyTo` and `references` a reply must record - the replied-to message's own `messageId`, and its
  `references` chain with that `messageId` appended, trimmed to `MAX_REPLY_REFERENCES` (20) from after the thread's
  root - and `createDraft(mailboxUid, folderUid, threading?)` now sends them when a draft is created.
  **A compose UI opening a reply or forward MUST pass them**: `@rapidmx/restapi` writes them into the `In-Reply-To`/
  `References` headers of the MIME it relays and files the message into the replied-to message's conversation, and a
  reply created without them is relayed carrying no threading headers at all - so every recipient, and the sender's
  own Sent Items copy, start a brand-new conversation for it. Nothing recovers them later: the MIME is composed from
  the recipients, subject and HTML passed to `assembleDraft()`, which say nothing about what is being replied to.
  `Message` now also exposes the `inReplyTo`, `references` and (server-assigned) `conversationId` this needs
  (needs the next `@rapidmx/restapi` release).
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
