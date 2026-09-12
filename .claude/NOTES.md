# Code review notes — rapidrest/mail-server

This file exists so that Claude sessions working in this repo don't re-litigate settled
decisions or re-discover the same issues from scratch. It is local to this repo (not tied to
any one machine's global Claude memory), so it travels with the code.

**Maintenance rule:** when a standing decision changes, update the section below in place
(don't just append a contradiction lower down). When a new investigation/session produces a
decision, finding, or reverted approach worth remembering, add a dated entry under Session Log.
Keep entries terse — this is a reference, not a transcript.

## Standing decisions

- **Commit discipline.** Don't `git commit` unless explicitly asked for *that specific piece of
  work*. An autonomous-execution/"commit as you go" approval given for one approved plan (e.g. via
  plan mode) is scoped to that plan only — it does not carry forward to later, separate requests in
  the same session, even ones that look similar in kind (a follow-up review-and-fix pass, a
  refactor, a new feature), and even after a full review-and-fix cycle with passing tests. Default
  to leaving changes staged/unstaged and saying so; only commit automatically within the exact
  scope of a plan that was explicitly approved as autonomous. If unsure whether new work falls
  inside that scope, treat it as outside and ask.
- **Commit message style: a flat list of one-line, verb-led items — no summary/title line, no
  `-`/`*` bullet markers.** This isn't just a style preference — it's dictated by how `release`
  (`@rapidrest/cli`) actually builds `CHANGELOG.md`. `collectChangelogBullets`/
  `classifyChangelogLine` (that repo's `src/lib/release.ts`) parse `git log --pretty=format:%B` and
  treat **every non-blank line of a commit's full message as its own changelog bullet** — there is
  no subject/body distinction. A conventional "short imperative subject + blank line + prose body"
  commit therefore leaks one changelog bullet per body sentence, and a `-`/`*`-prefixed line breaks
  `classifyChangelogLine`'s verb detection (it reads the line's first whitespace-delimited word as
  the verb; a leading `-` defeats that lookup and the dash leaks into the changelog text as
  `"- - Added foo"`). Correct format:
  - No separate summary/title line — if a commit needs an overview, that overview is itself just
    one more flat line, not a heading distinct from the rest.
  - No bullet-marker prefix of any kind — write bare lines.
  - Lead each line with an imperative verb where it fits: `Add`/`Fix`/`Remove` (and `-ing` forms)
    are recognized and become `Added`/`Fixed`/`Removed` entries; `Configuring`/`Converting`/
    `Refactoring`/`Updating`/etc. become `Changed`. Anything else still works, defaulting to
    `Changed` verbatim — see `CHANGELOG_VERB_REWRITES` in that repo's `src/lib/release.ts` for the
    full map.
  - A blank line before a trailing git trailer (`Co-Authored-By:`, `Signed-off-by:`, etc.) is fine
    — trailers matching `CHANGELOG_NOISE_PATTERNS` are dropped from the changelog — but nothing
    else should follow the item list.
  This mirrors JP's standing convention across his other repos; copy this exact rule verbatim into
  each sibling repo's own NOTES.md rather than paraphrasing it, since the paraphrase is what caused
  this to be gotten wrong in the first place (see `@rapidrest/cli`'s own NOTES.md, 2026-09-07 entry,
  for the full incident writeup and the `CHANGELOG_NOISE_PATTERNS` fix that accompanied it).
- **Never bump a `package.json` `version` field, in this repo or any sibling `@rapidrest/*` repo,
  and never publish/`npm publish` one.** JP has a formal release process for that (see e.g.
  `mail-server`'s own `"version"`/`"postversion"` npm-lifecycle scripts, which sync the Helm
  chart/README and push tags — a manual version edit bypasses all of that and produces conflicts).
  This applies even when a fix in a sibling repo is otherwise done and verified: land the source
  fix, leave the version field alone, and tell JP it's ready for him to version/publish himself.
  Once he publishes, bump *this* repo's dependency constraint (e.g. `"@rapidrest/auth": "^X.Y.Z"`)
  to the version he actually published — that part is fine, since it's just declaring what this
  repo needs, not deciding a sibling repo's own release number.

## Session Log

### 2026-09-11 — Reorganized into feature folders; absorbed 8 generic UI components from web-client

JP: react-shared should organize `src/` by feature/system (mirroring `restapi`'s own
`src/<feature>/` convention) instead of one flat 34-file folder, and should be the home for any
UI component reusable across *any* RapidMX front-end, not just business logic. Full plan in this
session's transcript; summary here for future sessions.

- **New `src/` layout**: `util/` (api.ts, apiQuery.ts, dateInput.ts, useIsMobile.ts), `auth/`,
  `branding/`, `admin/`, `mail/` (+ `mail/compose/`), `calendar/`, `contacts/`, `tasks/`,
  `booking/`, `search/`, and `components/` (`buttons/`, `feedback/`, `forms/`, `overlays/`,
  `avatar/`, `pickers/`, `navigation/`). `test/` mirrors it exactly. No `package.json`/
  `tsconfig.json`/`vitest.config.ts` changes were needed for the folder move itself — the
  existing `"./*.js"` exports wildcard, `rootDir: "src"`, and `**`-globbed test/coverage
  `include` patterns all already support arbitrary nesting; confirmed by inspecting `dist/`
  post-build before touching any consumer.
- **8 components moved in from `web-client`**: `Button`, `Alert`, `Skeleton`+`SkeletonList`,
  `FormField`, `PopoverPortal` (zero domain imports), plus `MiniDatePicker`, `ContactAvatar`,
  `BottomTabBar` (JP's explicit call — generic in code shape but previously single-domain-used).
  Added `date-fns` (`MiniDatePicker`) and `react-icons` (`BottomTabBar`'s `IconType`) as real
  dependencies. `Button`/`Alert`/`Skeleton`/`FormField` had **zero dedicated tests in
  `web-client`** (only ever covered incidentally through consumer pages) — wrote new ones here
  from scratch. The other 4 already had tests; moved those over, fixing one real coupling bug
  along the way: `BottomTabBar.test.tsx` imported `web-client`'s own `AppShell.APPS` fixture,
  which would have made this package depend on its own consumer — replaced with a local
  `NavItem[]` fixture.
- **`MiniDatePicker` needed `env: { TZ: "UTC" }` added to this repo's own `vitest.config.ts`**
  (copied from `web-client`'s) — its date-fns local-time calculations only agree with UTC ISO
  test fixtures if the test process itself runs in UTC; two tests failed non-deterministically
  (by host timezone) until this was added.
- **Tailwind content-scanning**: added `@source "../../node_modules/@rapidmx/react-shared/src";`
  to `web-client/apps/shared/styles/app.css` (the one stylesheet every consumer imports as its
  Tailwind entry) — otherwise none of this package's own Tailwind classnames
  (`Modal`/`Drawer`/`Button`/etc.) would ever be scanned, since v4's automatic scanning excludes
  `node_modules` by default. Verified by grepping the actual built CSS for real classnames
  (`shadow-modal`, `bg-danger-bg`), not just watching the build succeed.
- **Internal cross-file imports**: almost all of them needed no change at all (same-feature files
  land in the same folder together) — the one bulk pattern was every file's own `./api.js`/
  `./apiQuery.js` becoming `../util/api.js`/`../util/apiQuery.js`. Only `calendarColors.ts`
  (imports `mailApi.ts`'s `Folder` type — genuine cross-feature) needed a real path change beyond
  that pattern.
- **Consumer updates were scripted, not manual** (~226 `@rapidmx/react-shared/<basename>.js`
  references across `web-client`/`server`/`electron-client`, plus ~100 of `web-client`'s own
  relative imports to the 8 moved components) — a small Node script with an explicit rename map,
  run once per repo. It missed 5 same-directory bare imports (e.g. `AppShell.tsx`, which lives
  *inside* the old `layout/` folder, importing `BottomTabBar` as bare `"./BottomTabBar.js"` with
  no `layout/` prefix to match against) — caught by `server`/`electron-client`'s own build
  failing loudly (`Could not resolve './BottomTabBar.js'`), not by any test. Worth remembering:
  a suffix-based rename regex over relative imports must also check for the bare same-directory
  form, not just prefixed ones.
- Not committed - JP said "hold off on commit" for this whole cross-repo pass.

### 2026-09-11 — 100% coverage (99% branches, one documented exception), real CONTRIBUTING.md, fixed a broken `yarn lint`

Brought this package from 96%/96%/95%/96% (stmts/branches/funcs/lines) to 100%/99%/100%/100% and
pinned it via a new `thresholds` block in `vitest.config.ts` (there wasn't one before).

- **Three files had zero tests at all**: `calendarColors.ts`, `emojiData.ts` (mocked
  `@emoji-mart/data` with a small synthetic dataset - the real dataset is large/opaque and
  happening to contain both a missing-id reference and a skins-less emoji isn't something worth
  depending on for branch coverage), and `giphyApi.ts`.
- **`uploadBrandingIcon`/`deleteBrandingIcon` and `listMailboxDomains`/`autoProvisionMailbox`
  were simply never called by any test**, despite their sibling functions (`uploadBrandingLogo`,
  `deleteBrandingLogo`, `createMailbox`, etc.) being fully covered - added the missing cases
  alongside the existing ones in `brandingApi.test.ts`/`mailApi.test.ts`.
- **Real finding, not fixed here**: `useBranding.ts`'s stylesheet-link effect's doc comment says
  it "reuses an existing `<link>` (server-rendered ... when a stylesheet is already configured)",
  but it actually doesn't - `branding` starts `null` on every mount, so this effect's own first run
  (before the `getBranding()` fetch resolves) always takes the "no stylesheetUrl yet" branch and
  removes whatever link is already there, including a legitimate server-rendered one. By the time
  branding loads, the link is already gone, so a fresh one is always created rather than reused -
  the "reuse" branch is unreachable through the public hook in any achievable render sequence
  (confirmed: even unmount/remount doesn't reach it, since the next mount's own first-null-render
  removes it again). Documented via a test of the *actual* behavior
  (`test/useBranding.test.tsx`, "removes a pre-existing stylesheet link immediately on mount...")
  rather than a test asserting the doc comment's claimed behavior (which doesn't happen). Pinned
  `vitest.config.ts`'s `branches` threshold to 99 (not 100) for exactly this one unreachable
  branch - see that file's own comment. Worth JP's own look as a possible real bug (a
  server-rendered stylesheet always flashes off then back on rather than staying put across
  hydration) - not changed here, out of scope for a coverage pass.
- **Fixed a pre-existing broken `yarn lint`**: `eslint.config.mjs` imports `globals`,
  `eslint-plugin-import`, and `eslint-plugin-jsdoc`, none of which were in `package.json`'s
  `devDependencies` - `yarn lint` failed outright with `ERR_MODULE_NOT_FOUND` before this session,
  unrelated to any of this session's own changes. Added all three (versions matched to the same
  ones already used in `web-client`/`electron-client`/`postfix-bridge`) and reinstalled.
- Fixed `CONTRIBUTING.md`'s bug-report/feature-request examples and "RapidREST repository" wording
  (both leftover from the generic template, `@rapidrest`/`ModelRoute`/MongoDB-flavored - none of
  that applies to this package) - replaced with a `configureApiBaseUrl()`/`apiFetch()`-relevant
  example.
- Not committed - JP said "hold off on commit" for this whole cross-repo pass.

### 2026-09-11 — Add `crypto/` (client-side E2E encryption foundation)

Added `src/crypto/`: `masterKey.ts` (MK generation, AES-256-GCM AEAD seal/open with mailboxUid+purpose
bound as AAD, HKDF-SHA256), `passwordUnlock.ts` (Argon2id via `hash-wasm` → HKDF-split auth-proof/
wrapping-key), `recoveryCode.ts` (CSPRNG codes, HKDF derivation), `passkeyUnlock.ts` (WebAuthn PRF via
the raw `navigator.credentials` API - deliberately not `@simplewebauthn/browser`, since this credential
is a local KDF input with no server-verified ceremony, not an auth flow), `keys.ts` (P-256 ECDSA
keypair + real PKCS#10 CSR via `@peculiar/x509`, with export/import helpers proving the same key
material re-imports under ECDH for actual key-agreement use), and `keyvaultApi.ts` (typed wrappers
over `@rapidmx/restapi`'s key-vault/discovery/policy endpoints). New dependencies: `@peculiar/x509`,
`hash-wasm`, `reflect-metadata`.

- 100% stmts/lines/functions, 99.65% branches across the full suite (only the pre-existing, already-
  documented `useBranding.ts` gap above remains) - every crypto test uses real WebCrypto/Argon2id/CSR
  operations, not mocked crypto, including round-trips, tamper/AAD-mismatch rejection tests, and
  direct ECDSA→ECDH re-import interop verification.
- `web-client` consumes this via a **new `yarn patch`** (not yet a real npm publish) specifically to
  reach this new `crypto/` subpath - see that repo's own NOTES.md (same date) for the full
  consequences: patching alone does not pull in a patched package's *new* transitive dependencies
  (`@peculiar/x509`/`hash-wasm`/`reflect-metadata` had to be added directly to `web-client`'s own
  `package.json` too), and a `vi.stubGlobal("fetch", ...)`-based mock does not reliably reach this
  specific not-yet-published subpath in that repo's test suite (root cause not fully isolated - work
  around it there with a module-level `vi.mock()` instead, not by changing anything here).
- `enrollKey()`'s `useType: "encrypt"` path is the only one actually wired up client-side so far
  (`web-client`'s `KeyEnrollmentGate`) - `useType: "sign"` has no real path yet, since RFC 8823 ACME
  public-CA enrolment doesn't exist server-side (`restapi`'s own scope, tracked separately).

### 2026-09-11 — CMS/S-MIME engine, compose-time sign/encrypt decisions, message-view decrypt/verify

Added on top of the `crypto/` foundation above, completing Phase 3 of the E2E encryption plan
(server wiring → client key foundation → **CMS sign/encrypt + message-view decrypt/verify**, in
that order; Phase 4 discovery/contacts UI and Phase 5 settings/recovery UI are still ahead):

- `keySession.ts` — the in-memory (never localStorage/IndexedDB) session key store the spec's
  "destroyed on explicit logout" requirement calls for. `unlockWithPassword()` fetches the vault,
  re-derives the wrapping key via the *exact* KDF params (`passwordUnlock.ts`'s new
  `parseArgon2idKdfLabel()`, the inverse of `argon2idKdfLabel()`) the wrap was created with, unwraps
  MK, then unwraps/imports whichever signing/encryption keys have a currently-active public key on
  file. Password is the only unlock method wired up so far - passkey/recovery-code derivation exist
  but nothing calls them yet (a mailbox enrolled *only* via passkey can't unlock through this module
  today).
- `smime.ts`/`smimeMessage.ts` — the CMS engine (`pkijs`+`asn1js`, new deps) and RFC 9788 header-
  protection MIME assembly on top of it. **Verified RFC 9788's actual wire format via WebFetch
  against the RFC text directly** rather than assuming from memory - its real mechanism (protected
  headers as literal header lines on the signed/encrypted entity itself, an `hp="clear"`/`"cipher"`
  Content-Type parameter, `HP-Outer:` field copies, outer `Subject` obscured to `"[...]"` under the
  required `hcp_baseline` default) is materially different from the RFC 8551 §3.1
  `message/rfc822`-wrapping approach the spec explicitly forbids. `pkijs.setEngine("rapidmx", crypto,
  crypto.subtle)` uses the raw 3-argument form, not `new pkijs.CryptoEngine({...})` - the latter
  fails `tsc --noEmit` (a real type-definition bug in pkijs itself: `generateKey`'s Ed25519/X25519
  overloads don't line up between the class and its own declared interface) despite working at
  runtime, which only surfaced because this repo actually runs `tsc --noEmit` separately from
  `vitest` (esbuild's transform strips types without validating them - a test suite passing is not
  proof the code typechecks).
- `composeSecurity.ts` — pure sign/encrypt decision functions for compose. `classifyRecipientTier()`
  (same-org/federated/external) is a **disclosed approximation**: the spec's tiers are a genuine
  server-side administrative concept restapi 0.6.0 doesn't expose to the client at all (confirmed by
  reading `util/KeyringUtils.ts` - no tier field on a key lookup result), so this falls back to a
  domain-suffix heuristic. A real fix needs a restapi endpoint exposing which domains a server
  controls.
- `messageSecurity.ts` — the received-message counterpart: reads a raw MIME's own outer Content-Type
  to classify it as `multipart/signed`/`pkcs7-mime enveloped-data`/neither, then decrypts/verifies
  into one of the spec's five Message Security Indicator states. **Trust Model gap, disclosed not
  silent**: it accepts an optional pinned-signer-fingerprint parameter (via the new
  `smime.ts#computeCertFingerprint()`) but no caller supplies one yet - Contact key-pinning UI is
  Phase 4 work, so every signature verified today is only proven mathematically self-consistent, not
  checked against a TOFU-pinned identity yet.
- New deps: `pkijs`, `asn1js` (the CMS engine), `dompurify` (client-side sanitization of a decrypted
  message body before rendering - the server's own `sanitize-html` pass never runs against
  ciphertext it can't read).
- Coverage held at 100% stmt/line/func, ~99% branches throughout (see `vitest.config.ts`'s own
  per-branch justification comments for the handful of accepted unreachable gaps, mostly in
  `smime.ts`'s defensive error paths).

## Session log

- **2026-09-11 — RFC 9788 `HP-Outer` tamper detection on receipt.** `smimeMessage.ts`'s
  `protectedHeaderLines()` already *wrote* `HP-Outer: <Field>: <value>` copies on every encrypted
  message; nothing ever read them back. Added `extractHpOuterHeaders()` (regex-scans the raw header
  block text directly, not the flat `headers` map `splitHeadersAndBody()` returns - that map can only
  hold one value per lowercased name, so it silently drops all but the last of several same-named
  `HP-Outer:` lines) and wired a new optional 4th `parseEncryptedMessage()` parameter
  (`actualOuterHeaders`, the caller's own real received envelope) that produces a new
  `ParsedEncryptedMessage.headerTamperDetected` field. Deliberately kept **separate** from the
  existing 5-state `MessageSecurityState` enum rather than folded into `"signature_failed"`: HP-Outer
  is written unconditionally on every encrypted message regardless of whether it's also signed, so a
  tampered-but-unsigned message reusing the signature-failure state would misrepresent what actually
  went wrong. `messageSecurity.ts#evaluateMessageSecurity()` now also destructures `headers` from its
  own top-level `splitHeadersAndBody(rawMime)` call to build `actualOuterHeaders` and propagates the
  result onto `MessageSecurityResult.headerTamperDetected`. RFC 9788's own "MUST visually distinguish"
  requirement is left to a caller-side UI banner (`MessageDetailPane.tsx`, not yet wired at time of
  writing), separate from the existing state badge. `splitHeadersAndBody()`'s return type gained a
  `rawHeaderBlock: string` field (the pre-parse header block text) to make this possible without a
  second parse pass. (Since wired into `MessageDetailPane.tsx` as its own `Alert` banner - see
  `web-client`'s NOTES.md, same date.)

- **2026-09-11 — `search.md` Tier 1 client support: query grammar parser, `searchApi.ts` brought up
  to restapi's actual interface.** Investigation before starting this found Tier 1 (server-side
  search) **already fully implemented and mounted** in the current restapi release -
  `SearchProvider`/`SearchDocument`/`SearchQuery`/`SearchResult`/`CandidateQuery` in
  `restapi/src/search/SearchProvider.ts` already carry every field `specs/search.md` §12/§14
  require (`from`/`to`/`cc`, `folderUid`, `flags`, `labels`, `hasAttachments`, `metadataOnly`), and
  `BaseSearchRoute` (mounted at `GET /mail/search` and `GET /mail/search/candidates` via `server`'s
  existing `SearchRoute.ts` files) already accepts the full operator-grammar query params and Tier-3
  candidate narrowing. None of that needed building - only this repo's client wrapper was stuck on
  the original bare-bones `{q, types, cursor, limit}` shape. Tiers 2/3 (local encrypted SQLite FTS5
  index, progressive skeleton-result UI, composite pagination cursor) remain **explicitly out of
  scope** - confirmed with JP via plan-mode `AskUserQuestion` before starting, since the spec itself
  says the web encrypting VFS needs prototyping before committing and flags an unresolved index-size
  measurement task.
  - Rewrote `search/searchApi.ts`'s `SearchResult`/`SearchParams` to carry every structured filter
    (`from`/`to`/`cc`/`subject`/`hasAttachment`/`before`/`after`/`folderUid`/`flags`/`labels`) and
    `metadataOnly`/`source` fields, matching `BaseSearchRoute.search()`'s exact query-param names.
    Added `candidates()` wrapping the already-shipped `GET /mail/search/candidates` Tier-3 endpoint -
    nothing calls it yet (that's real Tier 3 UI work, not this pass), added now so that work doesn't
    need to revisit this file's shape later.
  - New `search/queryGrammar.ts#parseSearchQuery()` - `specs/search.md` §14's operator grammar
    (`from:`/`to:`/`cc:`/`subject:`/`has:attachment`/`before:`/`after:`/`in:`/`is:`/`label:`/`type:`),
    parsed once client-side per the spec's own requirement. **Deliberately does not implement phrase-
    quoting or `-` negation itself** - those apply to the free-text remainder, which every provider's
    own engine already handles natively (the spec's own §14 "Provider Implementation": Postgres's
    `websearch_to_tsquery` understands quotes/`OR`/negation on untrusted input already) - reimplementing
    that client-side would just be a worse duplicate. Only operator tokens are extracted; an operator-
    looking token preceded by `-` or living inside a quoted phrase is left untouched in the free-text
    output, since there is no server-side representation for a *negated* structured filter.
  - New `search/searchScoring.ts` - the spec §7 field-weight table plus `normalizeServerScores()`
    (min-max normalization of one page's raw scores into `[0,1]`, preserving relative order). Only one
    source exists yet (Tier 1), so there's nothing to actually *merge* - written generically (a page's
    scores in, normalized scores out) so a future per-source call is all real cross-tier merging needs.
  - `web-client`'s inbox search UI (`apps/www/index.tsx`) now parses the raw search box value through
    `parseSearchQuery()` and forwards every structured field, plus renders `SearchResult.snippet` in
    place of the plain `bodyPreview` - see that repo's own NOTES.md, same date, for the UI-side details
    and a test-authoring bug caught along the way (a fixture missing a distinct `folderUid` let a
    stale pre-search render satisfy an assertion that should have waited for the real search response).
  - Full suite: 100%/99%+ branches held; every new file has its own dedicated test file.

- **2026-09-11 (continued) — `search.md` Tier 3: server-assisted narrowing over encrypted mail.**
  Investigation before starting Tier 2 (the local encrypted index) found two real infrastructure
  blockers - `web-client`'s shared Vite build has no proven Worker-bundling support (a prior
  Monaco-editor attempt hit this exact wall, `server/.claude/NOTES.md` 2026-09-06), and
  `electron-client`'s own NOTES.md explicitly says not to add native-module/packaging scope without
  asking first. Confirmed with JP (plan-mode `AskUserQuestion`) to build **Tier 3 first** instead -
  it needs none of that, just the already-shipped `candidates()` endpoint plus crypto that already
  exists. Tier 2 remains a separate future effort.
  - `crypto/messageSecurity.ts`'s `MessageSecurityResult` gained `subject?: string`, recovered from
    `protectedHeaders.subject` whenever content was actually decrypted/verified
    (`signed_verified`/`encrypted`/`encrypted_verified`) - needed because RFC 9788 header protection
    obscures the outer envelope's own `Subject` to `"[...]"` under the required `hcp_baseline`
    default, so `Message.subject` from the server is useless for content matching/display of an
    encrypted message's real subject. Additive; no existing test needed to change.
  - New `search/searchTier3.ts#searchEncryptedCandidates()`: calls `searchApi.ts#candidates()`
    (participants derived from `from`/`to`/`cc`; every other structured filter passes straight
    through from `ParsedSearchQuery`), decrypts each returned candidate
    (`getMessageRawContent()` + `evaluateMessageSecurity()`), and keeps only the ones whose real
    content actually matches the free-text remainder (AND-of-terms, case-insensitive) - the one
    thing the server structurally cannot verify for encrypted mail. Forces `types: ["message"]`
    always: contacts are never encrypted (Tier 1 already covers them), and calendarEvent/note/task
    encryption has no client-side decrypt path anywhere in this codebase yet. Short-circuits to `[]`
    (no request at all) when `unlocked` is absent or the query has no free text and no structured
    filter, mirroring `BaseSearchRoute`'s own "at least one of q or a filter" requirement.
  - **Deliberately not `dompurify` for HTML-to-text stripping**, despite that being this codebase's
    usual tool for handling a decrypted body (`MessageDetailPane.tsx`) - discovered mid-implementation
    that `dompurify`'s `sanitize()` only exists once handed a real `window` (throws `TypeError:
    default.sanitize is not a function` under this package's plain-Node test environment), while
    `pkijs`'s ECDH key derivation - which every crypto test here depends on - breaks under jsdom's
    WebCrypto shim (`ArgumentError: Parameter 'Zbuffer' is not of type ArrayBuffer`). No single
    environment satisfies both, so `stripHtml()` is a small hand-rolled regex instead - not a
    security boundary (the output only ever feeds a substring match, never touches a real DOM), and
    it behaves identically in Node, jsdom, and a real browser/Electron renderer.
  - Also generates a snippet locally (context window around the first matched term, or the start of
    the body for a pure-operator query) per spec §7's "client MUST generate snippets locally for any
    result it has decrypted... so snippet presence does not visibly differ by tier" - a small addition
    beyond the original plan, cheap given the matching code already has the stripped body in hand.
  - `web-client`'s `apps/www/index.tsx` runs Tier 3 alongside Tier 1 (`Promise.all`, only on the
    first page - no pagination wiring for it yet, a deliberate scope trim) and merges via a new
    `mergeSearchResults()`: both sides normalized independently through `searchScoring.ts`'s
    `normalizeServerScores()` (their raw scores occupy unrelated ranges), then merged by `entityUid`
    with a Tier 3 hit replacing a Tier 1 `metadataOnly` guess for the same message. See that repo's
    own NOTES.md, same date, for the UI-side details.
  - Full suite: 100%/98.97% branches (one new accepted gap, `searchTier3.ts`'s `security.subject ??
    ""` - `ProtectedHeaders.subject` is a required field, so the fallback is unreachable whenever the
    surrounding guard already required `subject` to be set - documented in `vitest.config.ts`).

- **2026-09-12 — Phase 2 of consuming restapi's 11 post-0.6.0 commits: Archive folder.** JP confirmed
  that batch (RFC 8823 ACME, Escrow Scoping, Labels, Archive, S3BlobStore) is done and asked for
  everything it unlocks to be implemented; sequenced smallest-first after a Phase 0 patch-in step (see
  `server`'s own NOTES.md for both). This phase: `mail/mailApi.ts` gained `archiveMessage(uid)`,
  wrapping the new `POST /mail/messages/:id/archive` (`FolderType.ARCHIVE`, lazily created on first use
  server-side, same pattern as Sent Items/Outbox - no client-side folder-creation step needed). Trivial
  wrapper, mirrors `recallMessage()`'s exact shape.
