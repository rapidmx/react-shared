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

- **2026-09-12 (continued) — Phase 3 of consuming restapi's 11 post-0.6.0 commits: Label entity.**
  New `mail/labelsApi.ts` - full CRUD wrapper over restapi's new `Label` scoped-child route, mirroring
  `mailSignaturesApi.ts`'s exact shape. `mail/mailApi.ts`'s `Message` interface gained `labelUids?:
  string[]`, and a new `setMessageLabels(message, labelUids)` helper (mirrors `setMessageRead()`'s
  identical "PUT the whole record, not a patch" shape) - `labelUids` is an ordinary settable field, not
  read-only, confirmed by reading `BaseLabelRoute`/`Message.labelUids` directly rather than assuming.
  Deleting a label also strips it from every message's `labelUids` server-side
  (`BaseLabelRoute.cleanUpDeletedLabel()`, a synchronous full-mailbox scan) - documented on
  `deleteLabel()`'s own doc comment so a caller doesn't try to duplicate that cleanup itself.

- **2026-09-12 (continued) — Phase 4 of consuming restapi's 11 post-0.6.0 commits: RFC 8823 ACME
  signing-certificate enrollment.** Closes the gap disclosed repeatedly earlier this session -
  `KeyEnrollmentGate` only ever provisioned the encryption key; signing had nowhere real to enroll.
  `crypto/keyvaultApi.ts` gained `startSignEnrollment(mailboxUid, {csr, wrappedKey})` (`POST
  /mail/mailboxes/:id/keyvault/keys/sign-enrollment` → `{enrollmentId}`) and
  `checkSignEnrollmentStatus(mailboxUid, enrollmentId)` (`GET .../sign-enrollment/:enrollmentId` →
  `EnrollmentResult{status:"pending"|"issued"|"failed", certificate?, error?}`), field names/paths read
  directly from restapi's `BaseKeyVaultRoute` source rather than guessed. Genuinely asynchronous - the
  CA issues via a real email round-trip, likely minutes away - so callers must poll rather than expect
  an immediate result; once `status` is `"issued"`, restapi's own `AcmeEnrollmentDriverJob` has already
  auto-installed the certificate into the mailbox's `KeyVault` server-side using the `wrappedKey`
  submitted upfront, so no further client call installs anything. See `server`'s own NOTES.md for the
  DI/config/job-registration wiring this phase also needed there (including a real, load-bearing gap
  found and fixed: the driver job wasn't in `Jobs.ts`'s re-export list, so it would silently never run
  even with the right backend selected).

- **2026-09-12 (continued) — Phase 5b of consuming restapi's 11 post-0.6.0 commits: Escrow Scoping,
  mailbox-owner wrapping.** `crypto/keyvaultApi.ts` gained `getEscrowInfo(mailboxUid)` (`GET
  /mail/mailboxes/:id/escrow-info` → `{escrowScopeId, publicKey}`), the client wrapper for `server`'s own
  new gap-filling proxy route (`BaseEscrowInfoRoute` - see that repo's NOTES.md for why it exists:
  restapi's own `GET /escrow-scopes/:id` is trusted-admin-only, with no lighter path for a mailbox owner
  to read the *one* scope their own mailbox is assigned to).
  - `crypto/masterKeyWraps.ts` gained `buildEscrowWrap(mk, escrowScopeId, scopePublicKeyCertDer)` -
    unlike `buildPasswordWrap()`/`buildRecoveryWraps()` (both symmetric, AEAD-under-a-derived-key), an
    escrow wrap has no shared secret the mailbox owner knows - only the scope's *public* key. Reuses
    `smime.ts`'s `encryptForRecipients()` (CMS `EnvelopedData`, ECDH key-agreement against a recipient's
    X.509 certificate) verbatim, the exact same operation already used to encrypt a message body to a
    recipient - just applied to MK instead. Matches the spec's own terse `wrap_escrow = AEAD(escrow scope
    public key, MK)` pseudocode; CMS EnvelopedData is the concrete mechanism that pseudocode leaves
    implicit, and was already implemented/tested here rather than being new crypto.
  - **A real wire-format judgment call, not specced down to this level**: `MasterKeyWrap`'s `nonce`/
    `salt`/`kdf` fields are required non-empty strings for every method (confirmed by reading restapi's
    own `validateMasterKeyWrap()`), but CMS `EnvelopedData` is fully self-contained (embeds its own IV and
    ECDH key-agreement material) - there is nothing left to put in `nonce`/`salt`. Resolved by writing
    fixed, documented placeholder values (`"n/a"`) for both and a descriptive `kdf: "cms-enveloped-data"`
    label - satisfies the wire contract without inventing new `MasterKeyWrap` fields; a holder's own
    unwrap tooling parses the CMS structure directly and never reads these two fields for this method.
  - Round-trip tested against a real generated test certificate/keypair (mirroring `smime.test.ts`'s own
    `generateTestIdentity()` helper) - confirms a holder with the matching private key can unwrap back to
    the exact same MK, and that a *different* scope's keypair cannot.
  - Settings UI (the mailbox owner actually calling these to add an escrow wrap once assigned) and the
    admin/holder UI (EscrowScope/Matter/EscrowAccessRequest/audit log CRUD) are `web-client`'s own Phase
    5b/5c, not yet built - tracked as the next step in this batch.

- **2026-09-12 (continued) — Phase 5c of consuming restapi's 11 post-0.6.0 commits: Escrow Scoping,
  admin/holder CRUD.** Four new `src/admin/*Api.ts` wrappers, same shape as every other CRUD wrapper in
  this directory (`transportRulesApi.ts`/`distributionListsApi.ts`/`labelsApi.ts`):
  - `escrowScopesApi.ts` - full CRUD over `escrow/scopes` (trusted-admin-only server-side). `EscrowScope`
    mirrors restapi's own shape exactly, including `publicKey: EscrowScopePublicKey` (an admin pastes in
    an already-issued certificate's fields here - nothing generates a keypair in this app).
  - `mattersApi.ts` - CRUD over `escrow/matters` plus `closeMatter()` (`POST /:id/close`). Holder-gated
    server-side, not admin-gated - a trusted admin who isn't a holder of the matter's own scope gets the
    same 403 as anyone.
  - `escrowAccessRequestsApi.ts` - a bespoke (non-CRUD) wrapper: `createAccessRequest({matterId,
    mailboxUid})`, `approveAccessRequest()`/`denyAccessRequest()`, and `getAccessRequestMaterial()`
    (`GET /:id/material` → `{masterKeyWraps}`, readable only once `approved`/`fulfilled` - still-wrapped
    ciphertext, never anything this server or client could decrypt itself).
  - `escrowAuditLogApi.ts` - read-only `listAuditLogEntries`/`getAuditLogEntry` (create/update/delete are
    unconditionally rejected server-side - the log is append-only, written internally by restapi's own
    escrow routes) plus `verifyAuditChain()` (`GET /verify`, trusted-admin-only server-side - the wrapper
    itself enforces nothing, same "server is the actual gate" posture as every other role-gated wrapper).
  - All four fully covered (100%/100%/100%/100%), mirroring existing `test/admin/*.test.ts` conventions.
  - `web-client`'s own admin (`apps/admin/escrow-scopes`) and new holder-facing (`apps/escrow`) UI built on
    top of these - see that repo's NOTES.md for the full breakdown, including why `apps/escrow` needed a
    new top-level app rather than living under `apps/admin` (holding escrow is a separate role from server
    administration, per the spec's "Separation of duties").

- **2026-09-12 (continued) — Adversarial review pass over the restapi-consumption batch.** An adversarial
  review agent verified `buildEscrowWrap()`'s CMS-EnvelopedData placeholder-field reasoning is sound (the
  round-trip test genuinely exercises the real implementation, and nothing today reads an escrow wrap's
  `.salt`/`.nonce` at all) but flagged a latent fragility: `fromBase64("n/a")` does **not** throw (`atob()`
  only rejects an input whose length is `4n+1`, and `"n/a"` isn't) - it silently decodes to 2 arbitrary
  bytes instead. Nothing calls `fromBase64()` generically across every wrap method today (`keySession.ts`
  only ever reads `.salt`/`.nonce` after first filtering to `method === "password"`), so this isn't an
  active bug, but a future "clean up the repeated per-method special-casing" refactor could easily
  reintroduce it as one. Strengthened `masterKeyWraps.ts`'s doc comment on `ESCROW_NONCE_PLACEHOLDER`/
  `ESCROW_SALT_PLACEHOLDER` to spell this out explicitly, so a future refactor has a concrete warning to
  trip over rather than discovering it the hard way. The other flagged item (does `handleRotateKeys` in
  `web-client`'s Settings > Encryption correctly maintain escrow protection across a key rotation) turned
  out to be a real bug, but entirely in `web-client` - see that repo's own NOTES.md for the fix; no change
  needed here since `buildEscrowWrap()`/`getEscrowInfo()` themselves were already correct, just never
  called from the rotation flow.

- **2026-09-12 (continued) — Phase 3 of consuming restapi's next batch (compliance roadmap Groups A-F):
  Retention Policy (Group C).** New `src/admin/retentionPolicyApi.ts` - `getRetentionPolicy()`/
  `updateRetentionPolicy(patch)` over the deployment-wide singleton `RetentionPolicy` row
  (`mail/retention-policy`), mirroring `keyvaultApi.ts`'s `getEncryptionPolicy()`/`updateEncryptionPolicy()`
  shape exactly (same singleton-GET/admin-PUT pattern). Both fields (`messageRetentionDays`,
  `auditLogRetentionDays`) are optional - `undefined` means "no automatic purge" - and `GET` never 404s,
  returning `{}` when unset. Exported `MIN_AUDIT_LOG_RETENTION_DAYS` (2190) purely so client-side
  validation copy can quote the same number the server enforces; the server is the real gate either way.
  100% covered, mirroring `test/admin/escrowScopesApi.test.ts`'s conventions.

- **2026-09-12 (continued) — Phase 4 of consuming restapi's next batch: GDPR data export (Group D1).**
  New `src/mail/dataExportApi.ts` - `createExportRequest({format, mailboxUid?})` (own mailbox unless a
  trusted caller supplies one), `listExportRequests()`, `getExportRequest(uid)`, and
  `exportRequestDownloadUrl(uid)`. That last one is deliberately a plain URL-builder, not a fetch
  wrapper - the download endpoint streams raw bytes back with its own `content-disposition: attachment`
  header, so a caller renders it directly as `<a href={...}>` and lets the browser handle the download
  natively, the exact same "no JS fetch/blob needed" pattern `mailApi.ts`'s `attachmentContentUrl()`
  already established for attachment downloads - discovered by checking how attachments are actually
  downloaded in `web-client` before inventing a blob-fetch helper that would have duplicated existing,
  working infrastructure. 100% covered.

- **2026-09-12 (continued) — Phase 5 of consuming restapi's next batch: Mailbox import, Mbox + PST
  (Group D2).** New `src/mail/mailboxImportApi.ts` - `uploadMailboxImport(file, {format,
  targetFolderUid, mailboxUid?})`, `listImportRequests()`, `getImportRequest(uid)`. The upload wrapper
  bypasses `apiFetch()` (which always forces `Content-Type: application/json`) exactly the same way
  `mailApi.ts`'s `uploadAttachment()` already does for a raw-bytes upload - sends the file's own bytes as
  the request body with `format`/`targetFolderUid`/`mailboxUid` as query-string params (not JSON),
  matching `BaseMailboxImportRoute.create()`'s real wire shape, and hand-replicates `apiFetch()`'s own
  error-decoding logic (content-type sniffing, `message`/`error` fallback, `statusText` fallback) since
  it can't reuse that helper here either - same duplication `uploadAttachment()` already accepted for the
  identical reason. 100% covered, mirroring `test/mail/mailApi.test.ts`'s own `uploadAttachment`
  describe-block conventions (every response-shape/error-path branch, not just the happy path).

- **2026-09-12 (continued) — Phase 6 of consuming restapi's next batch: GDPR right-to-erasure
  (Group E).** New `src/mail/erasureRequestApi.ts` - `createErasureRequest()` (no parameters at all -
  unlike `dataExportApi.ts`/`mailboxImportApi.ts`, there is no admin-on-behalf-of path or `mailboxUid`
  override; always the caller's own mailbox, matching the route's own real signature exactly),
  `listErasureRequests()`, `getErasureRequest(uid)`, `approveErasureRequest(uid)`/
  `denyErasureRequest(uid, reason)` (trusted-admin-only server-side). `approveErasureRequest()`'s own doc
  comment flags the 409-if-legal-hold case explicitly, since it's the one error path a caller needs to
  handle differently in the UI (surface the server's own message, which names the blocking Matter). 100%
  covered.

- **2026-09-12 (continued) — Phase 7 of consuming restapi's next batch: eDiscovery, Matter export +
  Matter-scoped search (Group F).** New `src/admin/matterExportApi.ts` -
  `createMatterExportRequest(matterId)`, `listMatterExportRequests()`, `getMatterExportRequest(uid)`,
  `matterExportRequestDownloadUrl(uid)` (same plain-URL-builder/native-`<a href>` download pattern as
  Phase 4's `exportRequestDownloadUrl()` - no fetch/blob wrapper needed). New
  `src/admin/matterSearchApi.ts` - `searchMatter(matterId, text, params?)`, returning
  `Record<mailboxUid, SearchResultPage>`. Both live under `src/admin/` (not `src/mail/`) to match
  `mattersApi.ts`'s existing precedent - that folder holds every Matter/Escrow-family wrapper regardless
  of the actual authz gate, holder-only included. Exported `search/searchApi.ts`'s previously-private
  `buildSearchParams(text, params)` so `matterSearchApi.ts` reuses the identical operator-grammar
  query-param logic against a different base path, rather than re-implementing it - confirmed via
  `BaseMatterSearchRoute`'s own doc comment that it fans out the same grammar verbatim, just once per
  custodian mailbox. 100% covered on all three files (`searchApi.ts`'s existing suite, plus two new test
  files).

- **2026-09-12 (continued) — Fixed a real Tier 1/Tier 3 parity bug in `search/searchTier3.ts`, found
  while auditing outstanding spec work: `matchesFreeText()`/`countTermOccurrences()`/`buildSnippet()` all
  split the free-text remainder on plain whitespace, so a `"quoted phrase"` was matched as separate
  AND-ed words instead of a whole phrase, a `-negated` term was treated as a literal required word instead
  of an exclusion, and `budget OR forecast` required both words rather than either - directly contradicting
  `specs/search.md` §14's "the same query language across tiers, or the tiering becomes visible to the
  user," since Tier 1's Postgres `websearch_to_tsquery`/OpenSearch already handle all three correctly.**
  Added `tokenizeFreeText()` (quote/negation-aware, mirroring `queryGrammar.ts`'s own extraction
  conventions) and `groupByOr()` (splits on a bare unquoted `OR` into alternative AND-groups, `.some()`
  across them); `countTermOccurrences()`/`buildSnippet()` now share a `positiveTermTexts()` helper so
  scoring/snippeting stay consistent with what actually matched, ignoring negated terms. Removed two
  defensive checks (`if (match[2])` false branch already handled by the empty-string skip one line up
  being the only route there; `match[4]` truthy-check) that turned out unreachable given the regex's own
  structure, rather than writing untestable coverage for them - same "don't keep a guard the surrounding
  code makes impossible" precedent as elsewhere this session. Added 6 new tests (quoted phrase, negation,
  OR, literal quoted `"OR"` not mistaken for the separator, bare `OR` with nothing real on either side,
  an empty `""` contributing no requirement) - two of the first drafts had a test-authoring bug, not an
  implementation one (reusing the shared `HEADERS` fixture's own subject, which contained "budget",
  across messages meant to differ only by body content - fixed with a neutral subject per fixture).
  Rebuilt and refreshed `web-client`'s own patch to pick this up, same date.

- **2026-09-12 (continued) — Adversarial review pass over the searchTier3.ts rewrite above: one
  candidate finding investigated and determined NOT a bug, documented and pinned with a test instead of
  changed.** A reviewer flagged that an all-`-negated` free-text query (e.g. `-spam -junk`, no positive
  terms at all) makes `countTermOccurrences()` fall into its `terms.length === 0 -> return 1` fallback for
  every candidate that survives the negation filter, giving them all an identical flat score that
  `searchScoring.ts#normalizeServerScores()` then normalizes to `0` (its own documented behavior for a
  zero-range batch) - sinking genuinely content-matched, encrypted-only Tier 3 results to the bottom of
  any merged ranking against Tier 1.
  - **Investigated rather than assumed either way**: read `restapi/src/search/PostgresFullTextSearchProvider.ts`
    directly to check what Tier 1 actually does for the identical query shape. Confirmed
    `ts_rank(search_vector, websearch_to_tsquery(...))` degrades the same way for an all-negative
    tsquery - there's no positive lexeme for `ts_rank` to weight, so Tier 1's own batch for the same
    query is *also* flat, and *also* normalizes to `0`. Both tiers tie together rather than Tier 3 being
    one-sidedly disadvantaged relative to a genuinely-differentiated Tier 1 batch - the actual outcome the
    "same query language across tiers" parity goal wants, not a regression.
  - Also confirmed mathematically that no alternative constant in place of `1` would change the outcome:
    `normalizeServerScores()`'s zero-range branch ignores the tied value entirely and always returns `0`
    - so this isn't fixable (or brokeN) at `countTermOccurrences()`'s level at all; whatever "problem"
    exists lives in the independent-per-tier-normalization-then-raw-merge design itself, which is its own
    pre-existing, deliberately-scoped decision (that file's own module doc comment: real cross-source
    score-space unification is out of scope for this pass).
  - Added a doc comment on `countTermOccurrences()` spelling out this reasoning (so a future reviewer
    doesn't re-flag it without checking Tier 1's own behavior first) and a pinning test asserting two
    genuinely different-content candidates get the identical score for an all-negated query - protects
    against a future change accidentally making this asymmetric between tiers instead of symmetric.

### 2026-09-14 — Round-3 review fixes (S/MIME receive path, calendar tz, API contracts, key session)

- **S/MIME (critical, PoCs confirmed against the old dist before fixing):** `verifyDetached()` now rejects
  SignedData carrying eContent (pkijs silently prefers eContent over the supplied `data`) and both verify
  functions require `eContentType` id-data; the signer certificate is pkijs's `extendedMode`
  `signerCertificate` (the SignerInfo's match), never `certificates[0]`. PoCs live on as
  `test/crypto/smimeRegressions.test.ts`.
- **Identity binding** (`messageSecurity.ts`, exported `checkSignerBinding()`): pin mismatch or pin with no
  cert → `untrusted_signer`; cert emails (SAN rfc822Name, else subject E / email-shaped CN - the CN fallback
  keeps our own test/self-signed certs working) must contain the single protected From (outer From when
  there are no protected headers) → else `signer_identity_mismatch`; protected From/To must equal the outer
  envelope's → else `header_mismatch`. All map to `state: "signature_failed"` plus new optional
  `signatureFailureReason` - the state union was deliberately NOT extended (web-client switches on it).
- **Decrypt rejects non-AEAD** (`UnsupportedContentEncryptionError`, AES-GCM OIDs only). Interop cost:
  legacy AES-CBC S/MIME mail is undecryptable by design.
- **MIME parsing** moved to new dependency-free `crypto/mime.ts` (no MIME lib in deps; not worth adding
  one). `MessageSecurityResult.html` is real HTML only for text/html; text/plain is escaped into a `<pre>`
  with raw text in new `text`. RFC 2231/2047 not supported (documented in the module).
- Calendar (tz-aware expansion, local drag ids, detach ordering/rollback), API contracts (`apiUrl()`,
  `ContactPatch`, `RequestListParams`, `apply_label`, mailbox fields, search `mailboxUid`), key session
  (`subscribeKeySession`, master-key zeroing, iframe/sleep-aware idle timeout), recovery-code
  normalization, and Modal/Drawer focus trap + overlay stack were done in parallel in the same pass - see
  each module's doc comments. Known server gaps: restapi list endpoints didn't yet honour
  `limit`/`page`/`matterId`; tier-3 `has:attachment` uses the outer message's `hasAttachments`.
- web-client's `.yarn/patches/@rapidmx-react-shared-npm-0.4.0-*.patch` was regenerated from this dist.

### 2026-09-14 — Round-4 review fixes (key lifetime, calendar dates, MIME/header hardening, contracts)

Every finding was confirmed first (the reviewer's PoCs `rec.mts`, `drag.mts`, `sec.mts`, `redos.mjs` were run
against the pre-fix source; the rest by reading) and is pinned by a regression test - the crypto ones live in
`test/crypto/round4Regressions.test.ts`, the rest next to their module's existing tests. None skipped.

- **Destroyed master key used silently (HIGH).** AES-GCM accepts any 32 bytes, so a stale `UnlockedKeys`
  holder kept sealing/opening under the zeroed key. New exported `KeysLockedError` (`masterKey.ts`,
  re-exported from `keySession.ts`) and `assertKeyMaterialUsable()`: `sealWithKey`/`openWithKey`/`hkdfDerive`
  throw it for an empty/all-zero key, `sealWithKey` also for an all-zero 32-byte *plaintext* (a destroyed MK
  being re-wrapped), and all three `masterKeyWraps.ts` builders check `mk` up front. `destroyUnlockedKeys()`
  now also sets `UnlockedKeys.destroyed = true` and deletes the private `CryptoKey` handles;
  `rewrapPrivateKeysUnderNewMasterKey()` throws `KeysLockedError` and `searchEncryptedCandidates()` returns
  `[]` for a destroyed object. web-client should re-read `getUnlockedKeys()` at action time. The unwrapped
  private keys stay extractable (finding 16) - documented in `unlockWithPassword()`: rotation needs it, and an
  attacker able to call `exportKey()` can equally use the in-memory MK.
- **All-day events (HIGH/MEDIUM).** They are stored as UTC-midnight dates (web-client `allDay.ts`), so
  `expandOccurrences()` expands them in UTC (a Monday series in America/New_York had landed on Tuesdays), and
  `resolveDragAction()` computes an all-day day-drop as `Date.UTC(target) - start`. The round-3 test that
  assumed local-midnight all-day storage was replaced. New exports `toEventWallClock()`/`fromEventWallClock()`.
- **DST gap (LOW).** `ianaZone().fromWall()` now resolves per RFC 5545 using the offsets a day either side: a
  nonexistent time uses the pre-transition offset (02:30 -> 03:30 EDT, end shifted with it), an ambiguous one
  the earlier instant.
- **Series edits (MEDIUM).** `saveEventSeries()` - when `fields.startDate` moves the master (or `timezone`/
  `allDay` changes) - fetches the master, shifts the rule's `exceptions` by the same wall-clock delta, saves,
  then best-effort re-points each detached occurrence's `recurrenceId` (same `icalUid`, listed from the
  master's folder; restapi's model constructor accepts `recurrenceId` on update). Failures don't throw: the
  result is `SeriesSaveResult` = `CalendarEvent & { detachedOccurrenceSyncFailed?: boolean }`. An edit that
  doesn't move the start still costs one extra GET (to know the master's real start).
- **Duplicate address headers (HIGH).** `checkSignerBinding()` returns `header_mismatch` when the outer or
  protected header block repeats `From`/`To`/`Cc`/`Sender` (new optional `outerFields`/`protectedFields`
  inputs; `ParsedSignedOnlyMessage`/`ParsedEncryptedMessage` gained `protectedHeaderFields`). PoC: a second
  outer `From: ceo@` was `signed_verified`.
- **Malformed SAN (LOW).** `extractCertificateEmails()` returns `[]` when pkijs left a SAN unparsed (it threw a
  TypeError out of `evaluateMessageSecurity()`); result is `signature_failed`/`signer_identity_mismatch`.
- **Reader addressing (LOW).** `evaluateMessageSecurity(raw, unlocked, pin?, readerAddress?)` sets
  `notAddressedToReader` when protected To/Cc exist and don't include the reader (informational - Bcc
  recipients see it too; absent without a reader address or protected recipients).
- **Header injection / non-ASCII headers (MEDIUM).** `smimeMessage.ts` serializes the protected, `HP-Outer` and
  outer headers through one `headerLines()`: CR/LF/NUL become spaces (also in Content-Type and
  `additionalHeaders`), Subject and display names are RFC 2047 `B`-encoded (`mime.ts`
  `encodeUnstructuredHeaderValue`/`encodeAddressListHeaderValue`; addr-specs never encoded). Deterministic,
  so `HP-Outer` tamper comparison and From/To binding still compare like with like. Receive side decodes the
  protected Subject with new `decodeHeaderText()` (encoded-words + raw 8-bit UTF-8).
- **Binary-string MIME (LOW).** `getMessageRawContent()` now returns the bytes as a Latin-1 *binary string*
  (`bytesToBinaryString(res.arrayBuffer())` - not `TextDecoder("latin1")`, which is windows-1252). `mime.ts`
  treats a string with no code unit > 0xFF as bytes: 7bit/8bit bodies get their charset applied
  (`decodeBodyText`), decrypted content is converted with `bytesToBinaryString`, detached verification tries
  the latin1 bytes and (for legacy already-decoded callers) the UTF-8 bytes. A string with code units > 0xFF
  keeps the old "already text" behaviour. Known ambiguity, accepted: an already-decoded string whose only
  non-ASCII is Latin-1 (e.g. `"café"` from a legacy caller) in a QP literal run is now taken as bytes.
- **QP decode (LOW).** Linear, preallocated `Uint8Array`, literal runs encoded whole (no surrogate splitting).
- **Tier-3 HTML strip (MEDIUM).** `stripHtml()` (now exported) is a single pass with memoized close-tag lookup
  plus a `TIER3_MAX_HTML_LENGTH` (2,000,000) cap; 200k unclosed `<style>` tags strip in milliseconds.
- **vCard (LOW).** Escapes CR/CRLF, single-pass unescape, unfolding, `item1.`-style group prefixes ignored,
  `TYPE` normalized (comma/quoted lists, repeated `TYPE=`, vCard 2.1 bare params; work > home > other), `N`/
  `ADR`/`ORG` split only on unescaped `;`. `parseVCards()`'s signature is unchanged.
- **Flagged messages (LOW-MED).** Per-folder page cap (`FLAGGED_MAX_PAGES_PER_FOLDER` = 100), stop on a full
  page with nothing new, dedupe by uid across folders, `FLAGGED_FOLDER_CONCURRENCY` = 4.
- **Overlay stack (LOW-MED).** `push()` only slots an entry below deeper entries pushed in the *same commit*
  (a microtask-bumped commit counter), so an overlay opened later is on top regardless of depth.
- **Contracts.** `EscrowAuditVerificationResult.reason` (`EscrowAuditVerificationFailure` union, open to
  unknown strings), `EscrowAuditLogEntry.hashAlgorithm` (`"sha256" | "hmac-sha256"`), `DataExportStatus`
  gains `"processing"`, `IngestQueueEntry` gains `attempts`/`nextAttemptAt`/`scanLeaseExpiresAt` - all checked
  against restapi's `models/types.ts` / `util/EscrowAuditUtils.ts`.
- Not a finding but noticed: a certificate with a SAN that has only dNSName entries still falls back to an
  email-shaped CN (RFC 5280 would treat the SAN as authoritative). Left as-is; worth a look.
- web-client's react-shared patch was regenerated from this dist.

### 2026-09-14 — Round-5 review fixes (S/MIME trust, signed-part scope, key session lockout/races, contracts)

Every finding was re-checked against the source first; none turned out false, none skipped. S/MIME regressions
live in `test/crypto/round5Regressions.test.ts`, the rest next to each module's tests. Final full run: 81 files /
910 tests, coverage 100% statements/functions/lines, 99.39% branches (threshold 98); `tsc` and `yarn lint` clean.

- **Self-signed "Signed & verified" (HIGH).** There is no chain validation, so a valid signature + a certificate
  naming `From` proves nothing without a pin. `MessageSecurityState` gains `"signed_unverified_signer"` and
  `"encrypted_unverified_signer"` (BREAKING for exhaustive `Record<MessageSecurityState, ...>` maps - web-client's
  `STATE_BADGE` must add both). Verified states now require a pin match: the caller's
  `pinnedSignerFingerprints` (3rd param, now `string | string[]`) or the unlocked mailbox's own
  `signingFingerprint` (the `unlocked` param type gained that optional field; `UnlockedKeys` already has it). A
  supplied pin that doesn't match is still `signature_failed`/`untrusted_signer`; the mailbox's own key alone never
  makes a mismatch a failure. Results carry `signerFingerprint`/`signerEmails` whenever the signature itself was
  valid. Pin sources: `keyvaultApi.signingKeyFingerprints(keys)` (unrevoked sign keys, expired kept, lowercased;
  re-exported from `messageSecurity.ts`), `contactsApi.pinnedSigningFingerprintsFor(contacts, address)` and
  `contactsApi.fetchPinnedSigningFingerprints(folderUids, address)` (pages `listContacts`, 500/page, max 20 pages
  per folder). Contact `keys` are writable only by restapi key discovery (`BaseContactRoute` rejects client
  writes), so they are genuine TOFU pins; the helper never calls `lookupKeys()` (no Discovery on receipt). There
  is no server endpoint to pin a signer from the client, so "trust this signer" needs restapi work.
  `checkSignerBinding()` keeps "no pin = pin check skipped" (documented as not establishing trust).
- **Unsigned content under the badge (HIGH).** `parseSignedOnlyMessage()` requires exactly two parts (a third
  part is `invalid_signature`). With RFC 9788 protected headers present, `checkSignerBinding()` now also compares
  the Cc address set (both paths) and - with new `compareSubject: true`, used for signed-only - the Subject
  (RFC 2047-decoded, whitespace-normalized); a difference is `header_mismatch`. Mailing lists that tag subjects
  will now show those as failed. Results expose `protectedHeaders` (`MessageProtectedHeaders`: from/to/cc?/
  subject; absent for legacy senders, whose outer headers were never signed) and `attachments` (new
  `mime.extractAttachments()` / `MimeAttachment` with lazy `decode()`; also on `ParsedSignedOnlyMessage`/
  `ParsedEncryptedMessage`).
- **Unlock lockout (HIGH).** `unlockWithPassword()` now resolves `UnlockResult { unopenableKeys }`: a signing key
  that won't open/import under the (correct) master key is skipped and listed. The password wrap is opened
  first, so its failure stays the wrong-password signal (unchanged rejection); an encryption key that won't open
  rejects with new `UnopenableEncryptionKeyError { fingerprint, cause }` instead of the raw AEAD error.
- **Stale objects after lock / unlock racing a lock (MEDIUM/LOW).** The store tracks every `UnlockedKeys` it handed
  out per mailbox; `destroyUnlockedKeys()` destroys all of them (still no zeroing on a plain re-unlock). A
  per-mailbox lock generation (plus a destroy-all generation) is snapshotted at unlock start; if it moved, the
  unlock zeroes its master key and throws `KeysLockedError`.
- **Destroyed mid-await (LOW).** `rewrapPrivateKeysUnderNewMasterKey()` copies the handles first and re-checks
  `destroyed` before returning (zeroes the new MK, throws). `searchEncryptedCandidates()` re-checks before each
  decrypt and before building results.
- **DST-gap exception shift (LOW).** `saveEventSeries()` shifts an exception/`recurrenceId` from its nominal wall
  time (occurrence date + master's time of day, verified by round-tripping to the stored instant), falling back
  to the instant's own wall time for an instant the rule couldn't generate.
- **MIME (LOW).** QP decode decides bytes-vs-UTF-8 once per input. `encodeAddressListHeaderValue()` keeps group
  syntax (`label:` ... `;`, label encoded as a phrase; a `:` only opens a group when a `;` follows; `:` inside
  `<>` ignored).
- **vCard (LOW).** Unfold first, then split on `^[ \t]*BEGIN:VCARD[ \t]*$` (multiline, case-insensitive).
- **Contracts.** `Message` gains `scheduledSendAttempts`/`scheduledSendError`/`scheduledSendRelayedAt`/
  `scheduledSendLeaseExpiresAt`; `DataSubjectErasureStatus` += `in_progress`; `MatterExportStatus` += `processing`;
  `QuarantineReason` += `transport_rule`; `processingAttempts?` on matter-export/data-export/mailbox-import
  requests. Other unions checked against restapi `models/types.ts` - no further drift. `getBookingSlots` already
  passes `from`/`to`. `listAttachments` still sends `folderUid` + `messageUid` (restapi now lists by message and
  ignores `folderUid`). `enrollKey()` rejects with new `VaultAlreadyInitializedError` (extends `ApiRequestError`,
  status 409) when wraps were supplied, the server answered 409, and a re-read of the vault confirms it has wraps
  (so a lost optimistic-lock 409 isn't misreported).

### 2026-09-14 — Round-6 review fixes, W-A (key session references, master key generation contract)

Not committed. Final full run: 81 files / 919 tests, 100% statements/functions/lines, 99.39% branches; `tsc` and
`yarn lint` clean.

- **Replaced master keys held until lock (LOW).** `issued` now holds `WeakHandle`s (`WeakRef` where the runtime has
  it, else a strong `{ deref }` fallback - typed locally because the build lib is ES2020). The current object stays
  alive through `sessions`; a replaced one only while a consumer references it. `destroyUnlockedKeys()` destroys every
  handle that still derefs (so every object anyone can still use), and each unlock prunes dead handles. A collected
  object's bytes are not zeroed (nothing can reach them); that is the trade-off for not pinning them. Tests stub
  `WeakRef` with a fake whose target can be cleared to simulate collection.
- **`expectedMasterKeyGeneration` (contract, additive).** Checked against restapi `BaseKeyVaultRoute`: a body field on
  `enrollKey`, `startSignEnrollment`, `addMasterKeyWrap` and `rekey`, 409 on mismatch, 400 if not a non-negative
  integer. `KeyVault.masterKeyGeneration?: number`; new `ExpectedMasterKeyGeneration` interface extended by
  `EnrollKeyInput`, `SignEnrollmentRequest` and `RekeyInput` (JSON drops it when undefined);
  `addMasterKeyWrap(mailboxUid, wrap, expectedMasterKeyGeneration?)` spreads it into the body only when given (0 is
  sent). The 409 surfaces as a plain `ApiRequestError` (`enrollKey`'s `VaultAlreadyInitializedError` still needs wraps
  in the request plus a vault that has wraps). web-client doesn't pass it yet.

### 2026-09-14 — Recovery-code unlock, password replacement, "trust this signer" client

Not committed. Final full run: 81 files / 955 tests, 100% statements/functions/lines, 99.41% branches; `tsc` and
`yarn lint` clean.

- **Product decision (JP): a recovery code is single-use.** After unlocking with one, its wrap is removed; setting a new
  password is offered but optional. web-client drives that UI; this package provides the primitives.
- **`keySession.unlockWithRecoveryCode(mailboxUid, mailboxKeys, code)`** → `RecoveryUnlockResult { unopenableKeys,
  recoveryMethodId?, remainingRecoveryCodes }`. Tries every `recovery` wrap with `kdf: "hkdf-sha256"` (normalized code)
  until one opens. Corrupt or foreign-KDF wraps are skipped, and each wrapping key is zeroed after use. A wrong code,
  an empty code and a vault with no recovery wraps all reject with the same plain `Error`. The key-opening/lock-generation/
  store/notify tail is now one internal `openSession()` shared with `unlockWithPassword()`, whose behaviour is unchanged.
  `RECOVERY_KDF_LABEL` moved to `recoveryCode.ts` (re-exported from `masterKeyWraps.ts`) to avoid a keySession ↔
  masterKeyWraps import cycle.
- **`masterKeyWraps.consumeRecoveryCode(mailboxUid, methodId)`** wraps `removeMasterKeyWrap(uid, "recovery", methodId)`.
  **`replacePasswordWrap(mailboxUid, unlocked, newPassword, expectedMasterKeyGeneration?, params?)`** + `PasswordWrapReplaceError
  { reason, restored?, cause? }`. Checked against restapi `BaseKeyVaultRoute`:
  - Removing a wrap is 409 when no non-escrow wrap would remain, 400 when `methodId` is omitted and several wraps match,
    and 403 for escrow.
  - Removing doesn't check `expectedMasterKeyGeneration`; adding does (409).
  - restapi does NOT enforce a single password wrap. But password wraps have no `methodId`, so two can't be removed
    individually, which forces remove-then-add.
  - The helper builds the wrap first, then refuses without writing (`master_key_rotated` / `multiple_password_wraps` /
    `no_other_unlock_method`), removes, and adds.
  - On a failed add it re-posts the old wrap (own fields only, with the generation read) and reports `restored`.
  - **Callers must replace the password before consuming the recovery code**, because the unconsumed code's wrap is the
    "other unlock method" that makes the replace safe.
- **Trust this signer.** `MessageSecurityResult.signerCertificate` (base64 DER) is set for `signed_verified`,
  `encrypted_verified` and both `*_unverified_signer` states. It is deliberately never set for `signature_failed`, even
  when that result carries `signerFingerprint`. New `keyvaultApi.trustSigner(mailboxUid, { address, certificate })` →
  `POST /mail/mailboxes/:id/keys/trust`, returning `KeyLookupResult`. A 409 (different signing key already pinned) becomes
  `SignerKeyConflictError extends ApiRequestError`, and 400/403/404 pass through. The contract was confirmed with the
  restapi route being added in parallel. This closes the round-5 note that "trust this signer" needed restapi work.
- Two exact-`toEqual` fixtures in `smimeRegressions.test.ts` gained `signerCertificate`.

### 2026-09-15 — Key rotation continuity client (previousKeys, keyConflicts, resolveKeyConflict, signer_key_changed)

Not committed. Built against the restapi contract being added in parallel. Final full run: 82 files / 978 tests, 100%
statements/functions/lines, 99.42% branches; `tsc` and `yarn lint` clean.

- **Types (breaking).** `Contact.keyConflict` / `KeyLookupResult.keyConflict` are gone. Now `keyConflicts?: KeyConflict[]`
  (at most one per useType; `KeyConflict { useType, observedKey: PublicKey, observedAt, source }`),
  `previousKeys?: PreviousKey[]` (`PreviousKey extends PublicKey { replacedAt, replacement: "automatic" | "user" }`,
  newest first, <= 5 per useType) and `Contact.rejectedKeys?: RejectedKey[]`. `PublicKey.issuerCertificate?` (base64 DER).
- **`resolveKeyConflict(mailboxUid, ResolveKeyConflictInput)`** → `POST .../keys/resolve`, body sent field-by-field
  (`certificate` only when given). 409 → `PinnedKeyChangedError extends ApiRequestError`; 400/403/404 pass through.
- **Decision: previous keys are trusted signers.** `signingKeyFingerprints(keys, previousKeys?)` (now de-duplicated),
  `pinnedSigningFingerprintsFor()` and `fetchPinnedSigningFingerprints()` include `previousKeys` of either replacement
  kind. Same revocation rule as current keys (and the mailbox's own `keys`, which web-client passes through
  `signingKeyFingerprints()` for mail from its own address).
- **Contract amendment (same day): revocation reasons.** `PublicKey.revocationReason?: "superseded" | "compromised"`.
  New exported `isTrustedForVerification(key)`: expired → trusted; revoked + `"superseded"` → trusted; revoked +
  `"compromised"` or revoked with no reason (legacy) → never trusted. Initially revoked previous keys were never trusted,
  which would have failed every message signed before a routine rotation. `findActivePublicKey()` (choosing a key to
  sign/encrypt with) still skips every revoked key, superseded included.
- **`signerKeyStateFor(contacts, address)` / `fetchSignerKeyState(folderUids, address)`** → `SignerKeyState { pinned, previous,
  conflict? }` for a key-changed comparison. `pinned` = all sign keys (revoked/expired included, for display), deduped
  by fingerprint; `previous` sorted by `replacedAt` desc; `conflict` = first sign conflict. Contacts read only, no
  Discovery; shares paging with `fetchPinnedSigningFingerprints()`.
- **`signer_key_changed`.** New `SignatureFailureReason`; state stays `signature_failed`. `checkSignerBinding()` returns it
  when pins were supplied, the signer matches none, a certificate was resolved AND the identity + header checks pass.
  A pin mismatch that also fails identity/headers (or has no certificate) stays `untrusted_signer`. Only this reason
  (besides the verified/unverified-signer states) carries `signerCertificate`. No pins at all is still
  `*_unverified_signer`. Existing tests that expected `untrusted_signer` for a From-naming certificate with a wrong pin
  were updated to `signer_key_changed`.

### 2026-09-15 — Retained encryption keys (decrypt mail encrypted to a replaced key)

Not committed. Final full run: 83 files / 1003 tests, 100% statements/functions/lines, 99.45% branches; `tsc` and
`yarn lint` clean.

- **Gap closed.** Unlock only opened `findActivePublicKey(mailboxKeys, "encrypt")`, so once restapi marked an older
  encryption key `revokedAt` + `"superseded"` on installing a new one, mail encrypted to the old key stopped
  decrypting, although the vault still held its wrap (the spec retains old encryption private keys indefinitely).
- **`UnlockedKeys.retainedEncryptionKeys?: RetainedEncryptionKey[]`** (`{ fingerprint, certDer, privateKey }`), filled by
  `openSession()` (so password and recovery unlock both get it): every published `encrypt` key other than the active
  one with a vault wrap, whatever its revocation reason or expiry (compromised included: reading your own mail still
  needs it), de-duplicated, newest `notBefore` first, **at most `MAX_RETAINED_ENCRYPTION_KEYS` = 20** (older ones aren't
  opened at all and aren't reported). Imported non-extractable (only the active keys are exported, by `keyRotation.ts`).
  A retained key that won't decode/open/import goes into `unopenableKeys`; only the active encryption key still throws
  `UnopenableEncryptionKeyError`. The active key stays in the existing fields. Absent when there are none.
- **Destroy.** `destroyObject()` empties the array in place (`length = 0`, so a consumer holding the array loses the
  handles) and deletes the property; PKCS#8 plaintext is zeroed by `openPrivateKey()` as before.
- **Decrypt.** New `smime.decryptEnvelopedDataWithKeys(der, DecryptionKey[])`; `decryptEnvelopedData()` delegates with one
  key. Matching first: a slot's identifier (KeyTrans `rid`, or KeyAgree `encryptedKeys[0].rid` - issuer DER + serial
  bytes, or subject key identifier vs the certificate's SKI extension) naming a candidate's certificate is tried with that
  key only. Then trial: first candidate (active) against every untried slot (the old unbounded behaviour), the rest
  sharing `MAX_TRIAL_DECRYPTIONS` = 64; at most `MAX_DECRYPTION_KEYS` = 21 candidates; unparseable candidate certificates
  are skipped. New `smimeMessage.parseEncryptedMessageWithKeys(body, keys, outer?)`; `parseEncryptedMessage()` delegates.
  `evaluateMessageSecurity()`'s `unlocked` type gains optional `retainedEncryptionKeys` and passes active + retained, so
  search tier 3 and web-client's local index builder benefit unchanged.
- **Unchanged:** `findActivePublicKey()`; compose/sign only use the active fields. `rewrapPrivateKeysUnderNewMasterKey()`
  still rewraps only the active keys (web-client's rotation re-seals every vault entry itself, so nothing is lost there;
  anyone using this helper with `rekey()` would drop retained wraps, as before).
- pkijs can't parse a KeyAgree recipient with zero encrypted keys, so `encryptedKeys[0]` needs no guard. Tests in
  `test/crypto/retainedEncryptionKeys.test.ts` (unlock x2 methods, skip+report, bound via pkcs8 import count, lock mid-open,
  destroy, superseded/compromised decrypt, issuer-serial / SKI / RSA KeyTrans matching with a `decrypt` spy, reissued-cert
  trial, KEK slots, both bounds, single-key behaviour).

### 2026-09-15 — Verification seals; removed `rewrapPrivateKeysUnderNewMasterKey()`

Not committed. Built against the restapi contract being added in parallel (`Message.verificationSeal?` +
`verificationSealGeneration?`, `PUT /mail/messages/:id/verification-seal` `{ seal, masterKeyGeneration }`: 200
set/identical/replaced, 409 different and not replaceable, 400 invalid, 403). Final full run (after the amendment): 83 files / 1029 tests, 100% statements/functions/lines, 99.49% branches; `tsc` and
`yarn lint` clean.

- **Why.** Verification is client-side, so later key events (pins replaced beyond `previousKeys`, a deleted contact,
  a later revocation) turned mail that verified into "unverified"/"key changed". A seal records the first verification.
- **`src/crypto/verificationSeal.ts`.** Seal key = `hkdfDerive(masterKey, "rapidmx-verification-seal-v1" salt,
  "rapidmx:verification-seal:v1:<mailboxUid>")` (same pattern as web-client's `localIndexKey.ts`), imported as a
  non-extractable HMAC key, raw bytes zeroed, never cached (so nothing to destroy; `destroyed` checked on entry and after
  the derivation, zeroed MK throws via `hkdfDerive()`). Format `v1.<b64url JSON {v,mb,id,h,fp,st,t}>.<b64url 32-byte
  tag>`; the tag covers length-prefixed (u32 BE) UTF-8 fields `v1, mailboxUid, messageUid, rawSha256, fingerprint, state,
  verifiedAt` - not the JSON text. `h`/`fp` lowercased. Open computes the tag over the caller's uids + payload fields,
  constant-time compares, then also checks payload uids and hash. Malformed anything → `undefined`; destroyed →
  `KeysLockedError` even for garbage. Build throws plain `Error` for bad input or > 2048 chars.
  `rawMimeSha256(string | Uint8Array)` uses `binaryStringToBytes()` (UTF-8 for a non-binary string).
- **`evaluateMessageSecurityWithSeal()`** (in `messageSecurity.ts`; `evaluateMessageSecurity()` now delegates to a private
  `evaluateLive()` returning `{ result, kind, signedContent? }` - public output unchanged). `signedContent` exists because a
  signed-only `signer_key_changed` result carries no body publicly. Rules: live verified + no seal that opens → `sealToWrite`
  (a stored seal that doesn't open still gets one; the PUT will 409, caller ignores). Key-status failures only
  (`signer_key_changed`, `*_unverified_signer`) + seal opens + same fingerprint + state matching the message kind →
  `verified_at_first_open` with `verifiedAt`, `sealedState`, `liveState`, `liveSignatureFailureReason`, content,
  `laterCompromised` (from caller `signerKeys: PublicKey[]` - a record with that fingerprint failing
  `isTrustedForVerification()`). `headerTamperDetected` blocks both writing and honouring. `unlocked` undefined → seals
  ignored. Destroyed `unlocked` → `KeysLockedError`; a non-lock build failure just omits `sealToWrite`.
- **Contract amendment (same day): generation-bound seals.** `VerificationSealInput`/`OpenedVerificationSeal` gain
  `masterKeyGeneration`; payload `g`; MAC fields are now `v1, mailboxUid, messageUid, generation, rawSha256,
  fingerprint, state, verifiedAt`. `openVerificationSeal(..., rawSha256, expectedMasterKeyGeneration?)` refuses another
  generation explicitly. `VerificationSealOptions` gains required `masterKeyGeneration` (vault's current, `?? 0`) and
  `sealGeneration?` (`Message.verificationSealGeneration`); the stored seal is opened with the current generation.
  `sealToWrite` became `{ seal, masterKeyGeneration }` (chosen over a sibling `sealGenerationToWrite` so the two can't
  be separated), written when live verified and (no seal opens OR `sealGeneration < masterKeyGeneration`).
  **Decision:** seals are not carried across a rekey - an old-generation seal never opens under the new MK - so a
  rotation after a suspected compromise can't bless seals written with the old key; messages re-seal lazily on their
  next live verification. Server replaces a stored seal only when stored generation < current and request generation ==
  current, else 409.
- **`mailApi.ts`:** `Message.verificationSeal?`, `Message.verificationSealGeneration?`,
  `setMessageVerificationSeal(messageUid, seal, masterKeyGeneration)` (body `{ seal, masterKeyGeneration }`),
  `VerificationSealConflictError`.
- **Removed `keyRotation.ts`** (`rewrapPrivateKeysUnderNewMasterKey()`, `RewrappedPrivateKeys`) and its test: no callers in
  web-client/electron-client/server (grepped), and with retained keys it would drop wraps under `rekey()`. The active
  session private keys are still imported extractable (comment updated) - nothing in the repos exports them any more, so
  making them non-extractable is a possible follow-up.
- **web-client follow-up:** `MessageDetailPane.tsx`'s `SECURITY_INDICATOR` is a `Record<state, ...>` and needs a
  `verified_at_first_open` entry once it upgrades; it should also switch to the seal-aware evaluator and store `sealToWrite`.

### 2026-09-15 — Removed `booking/bookingApi.ts` (moved to `@rapidmx/booking-plugin`)

Not committed. Plan `cheerful-giggling-pine.md` section 6: the Calendly-style booking feature leaves core and ships as
`@rapidmx/booking-plugin` (new `D:/github/rapidmx/booking` repo, created from this repo at c215cf4, which takes the
`bookingApi.ts` source and its test).

- Deleted `src/booking/bookingApi.ts` and `test/booking/bookingApi.test.ts` (the whole `booking/` folders). Nothing else
  imported them and there is no barrel, so no re-exports to remove; `yarn build` no longer emits `dist/booking/`.
- Kept the mailbox resource-booking fields in `mail/mailApi.ts` (`autoAcceptBookings`, `bookingWindowDays`, ...) - those
  are room/resource scheduling, not booking types. `brandingApi.ts`'s "anonymous booking-page visitor" comment still
  holds (the plugin's public pages read branding).
- README's feature folder list drops `booking/`; RELEASE_NOTES.md gains an Unreleased breaking-changes bullet.
- Verification: 82 files / 1015 tests, 100% statements/functions/lines, 99.49% branches (gates unchanged); `tsc -p
  tsconfig.json`, `yarn lint`, `yarn build` clean. `tsc -p tsconfig.test.json` has 3 pre-existing errors (useBranding,
  escrowKeys, retainedEncryptionKeys tests), identical with the change stashed.
- web-client still consumes 0.4.0 through its yarn patch; it stops importing `bookingApi` in the same change.

### 2026-09-15 — Recipient suggestions (`mail/directoryApi.ts`)

- **Contract** (restapi `BaseDirectoryRoute`, server path `/api/mail/directory`): `GET ?q=&limit=` (server mailboxes +
  distribution lists; 403 for a caller with no mailbox on the server and no trusted role) and `GET /contacts?q=&limit=&
  mailboxUid=` (caller's own contacts folders, plus `mailboxUid`'s if readable). Both 400 for q < 2 or > 100 chars or a
  bad limit; default limit 8, cap 20; 120 requests/min per user each. Entries `{ displayName, address, kind }`, kind
  `user|shared|room|equipment|list|contact`.
- `normalizeQuery()` trims and cuts to 100 so the client never draws a 400; < 2 chars resolves `[]` with no request.
  `wellFormed()` drops entries without a string address (and non-array bodies).
- `fetchRecipientSuggestions()` uses `Promise.allSettled`: either source may fail (403 directory, 429, network) and the
  other's entries still return; both failing rejects with the contacts error (a non-`Error` reason becomes an
  `ApiRequestError` status 0); an `AbortError` from either always rethrows so callers can ignore stale requests.
  Merge = contacts first, dedupe by trimmed lowercase address, first wins, `limit` applied to the merged list.
- Tests `test/mail/directoryApi.test.ts`, 100% on the file. Full run 83 files / 1027 tests, 100 / 99.5 / 100 / 100;
  tsc, lint, build clean.

### 2026-09-15 — Reply/forward composition: full-body quotes, body layout, reply recipients

JP: "when replying the cursor should be at the top and the original content below" - plus a confirmed Reply All bug
(the replying mailbox got its own address in Cc, so it received a copy of its own reply). Fixed across this repo and
web-client (see that repo's NOTES for the UI half).

- **`mail/messageBodySanitizer.ts` (new)** is web-client `MessageDetailPane`'s display purifier, moved here verbatim
  (`stripRemoteCssUrls()`, the DOMPurify instance with its two hooks) so the compose quote can reuse the same policy
  instead of a second implementation. `sanitizeMessageBodyHtml()` = display (`FORBID_TAGS: link/meta/base`);
  `sanitizeQuotedHtml()` also forbids style/title/form controls/frames/objects/media/svg/math and, via a
  `RETURN_DOM_FRAGMENT` pass, removes every `img` whose `src` isn't a `data:` URI (a `cid:` image points at a part the
  reply doesn't carry). **Fails closed:** no `window`, or `isSupported` false, returns `""` - DOMPurify's own
  `sanitize()` returns the input unchanged when unsupported, which would be the opposite of what a caller wants.
  Forbidden tags keep their text (DOMPurify's `KEEP_CONTENT`), so a `<button>b</button>` leaves "b" - accepted.
  Note a leading `<style>`/`<meta>` in the input is parsed into `<head>` and simply vanishes, so a sanitizer test
  asserting on it has to put text before it.
- **`composeQuoting.ts`:** `QuotedBody` (`{ html?, text? }`), preferred over `bodyPreview` in `buildReplyQuote()`/
  `buildForwardQuote()`; the HTML branch falls through to text (then preview) when sanitizing leaves nothing visible
  (`hasVisibleContent()` counts an `<img>` as content). `buildComposeBodyHtml(signature?, quote?)` =
  `<p></p>` + signature + (`<p></p>` between the two) + quote, `""` with neither. `buildReplyRecipients()` is
  self-address exclusion + dedupe + Bcc dropped + the from-self (Sent Items) case; it returns `Recipient[]`, so the
  caller keeps display names (web-client formats them with its own `formatRecipient()`).
- **`recipientDisplayName()`** exists because of a restapi quirk found in the browser check: `ScanQueueJob` stores a
  delivered message's `from.displayName` as `result.parsedFrom`, which is the **whole** From header
  (`"Bob Allen" <bob@partner.test>`), so the attribution line and the reply chip read
  `"Bob Allen" <bob@partner.test> <bob@partner.test>`. The name is reduced to the part before its own address, and a
  name that is some *other* address is dropped (never shown as if it were the sender). Worth fixing in restapi too.
- **Also found there, not fixed here:** the same job stores `recipients` as the **envelope** recipients only
  (`entry.envelopeTo`), so a delivered message's record names nobody but the receiving mailbox - which is exactly why
  Reply All put JP's own address in Cc. web-client now recovers the real To/Cc from the message's own headers.
- Verification: 85 files / 1064 tests, 100% statements/functions/lines, 99.5% branches; `tsc`, `yarn lint`,
  `yarn build` clean. Lint gotcha: `jsdoc/check-indentation` rejects a wrapped `-` bullet list inside a doc comment
  (continuation lines are indented) - write the paragraphs flat instead.

### 2026-09-15 — Mail list UX phase 1 (data/API): sort/filter params, bulk actions, conversation expansion

Client half of restapi's mail-list overhaul (see that repo's NOTES entry of the same date for the server design and
for which Outlook options the data model can't serve). Phase 2 builds the UI in `web-client`.

- `listMessages()` takes `sortBy`/`sortOrder`/`filter` and sends only what's set. It no longer sends
  `sort={"receivedDate":"DESC"}` at all: the server now defaults to exactly that *plus* `uid` as a tiebreaker, and
  naming a sort here could only get it wrong. The existing test asserting that URL was updated, not deleted.
- Bulk actions go through `PUT /mail/messages` (`BaseScopedChildRoute.updateBulk()`), which already existed and
  loops `update()` server-side - no new endpoint was added. `bulkUpdateMessages()` chunks at
  `MAX_BULK_MESSAGE_UPDATE` (100, mirroring the server's new `MAX_BULK_UPDATE` cap) and stops at the first rejected
  chunk. It is deliberately *not* wrapped in per-element error recovery: the server is fail-fast and non-atomic, so
  a caller that needs per-item outcomes should call the single-message functions.
- `flaggedMessages.ts` keeps its per-folder fan-out (a message list is folder-scoped; this smart list isn't) but now
  passes `filter: "flagged"`, so the server returns only flagged rows. The client-side `flags.flagged` check is kept
  as a guard for a row written before the server's `flagged` mirror existed, not as the filter - which is also why
  its existing tests still pass unchanged.
- `conversationsApi.ts` builds its query with `URLSearchParams` now (several optional params), which encodes the
  same way the old hand-rolled `encodeURIComponent` did - the two existing URL assertions were kept verbatim to
  prove it.

Verification: `yarn tsc --noEmit`, `yarn lint`, `yarn build` clean. Full `yarn test` (coverage): 85 files / 1076
tests, 100 / 99.4 / 100 / 100.

### 2026-09-15 — Mail list label filter: `labelUids` on listMessages/listConversations

Client half of restapi's `?labelUids=` work (see that repo's NOTES entry of the same date for why the predicate is
built per backend and why it is deliberately *not* a mirror column). web-client's Filter menu gains "filter by label,
itself a menu of all labels, with multiple selection".

- `MessageListParams.labelUids?: string[]` and `ConversationListParams.labelUids?: string[]`, joined into one
  comma-separated value. **OR** between the labels, ANDed with `filter`. An empty array sends no parameter at all —
  the point being that a filter menu with nothing ticked issues the exact request it always did, so no existing URL
  assertion moved.
- `MAX_MESSAGE_LABEL_FILTER` (20) mirrors the server's `MAX_MESSAGE_LABEL_FILTER_UIDS`, same as
  `MAX_BULK_MESSAGE_UPDATE` mirrors `MAX_BULK_UPDATE`. The UI should stop the user at that many rather than send a
  request the server answers with a 400.
- **The menu's own data already existed**: `listLabels(mailboxUid, params)` in `mail/labelsApi.ts`. Labels are
  per-mailbox (`Label.mailboxUid`, `BaseScopedChildRoute` scoped by it), so the menu is rebuilt when the active
  mailbox changes, and a label uid from another mailbox simply matches nothing.
- `listConversations()` destructures `labelUids` out before `conversationQuery()`, which types its values as
  `string | number | undefined` — passing the array through would have relied on `String(array)` happening to join on
  commas.

Verification: `yarn tsc --noEmit`, `yarn lint`, `yarn build` clean. Full `yarn test` (coverage): 85 files / 1079
tests, 100 / 99.4 / 100 / 100.

### 2026-09-16 — A blank line above the quote, and the threading a reply has to record

Two small changes to `mail/compose/composeQuoting.ts` plus one to `mail/mailApi.ts`, both driven by JP using the
product: a reply opened with the quote pressed right up against the caret's line, and a reply chain showed up in the
mail list as separate conversations.

- **`buildComposeBodyHtml()` now emits an empty paragraph immediately above the quote**, on top of the one that
  already separated it from a signature: `<p></p>` + signature + `<p></p>` + `<p></p>` + quote. A signature-only body
  is deliberately unchanged (a test counts the empty paragraphs in both cases), since the extra line is about having
  somewhere to press Enter into above the "On ... wrote:" block, which only a reply has.
- **`buildReplyThreading(message)` + `createDraft(mailbox, folder, threading?)`** are the client half of restapi's
  reply-threading fix (see that repo's NOTES entry of the same date for the whole diagnosis). The server composes a
  reply's MIME from `assembleDraft()`'s recipients/subject/HTML, which say nothing about what is being replied to, so
  unless the draft *row* records `inReplyTo`/`references` the relayed message carries no `In-Reply-To`/`References`
  at all and every copy of it - the recipients' and the sender's own Sent Items one - starts a new conversation.
  Neither field is server-managed, so they go in the ordinary `POST /mail/messages` body `createDraft()` already
  sends.
  - `references` = the replied-to message's own chain with its `messageId` appended (RFC 5322 section 3.6.4), never
    repeating it wherever the chain already names it, trimmed from *after the root* to `MAX_REPLY_REFERENCES` (20) -
    the root is what a conversation is keyed on, so it is the one entry that must survive. restapi trims again when
    it writes the header; sending an unbounded chain is pointless.
  - `Message` gained `inReplyTo`, `references` and `conversationId`, which it never exposed - `buildReplyThreading()`
    needs `references`, and a client cannot build a chain from `messageId` alone.
- **web-client still has to call it**: `ComposeWindow.tsx`'s `createDraft(mailboxUid, draftsFolderUid)` passes no
  threading today, so Reply/Reply All/Forward on a real thread is still unthreaded until it does. Nothing in this
  package can do it for the caller - only the compose UI knows which message the window is replying to.

Verification: 85 files / 1088 tests, 100% statements/functions/lines, 99.34% branches (gates unchanged); `tsc
--noEmit`, `yarn lint`, `yarn build` clean. Lint gotcha: `as any` on a `messageFixture()` argument that already
satisfies the parameter type is `typescript/no-unnecessary-type-assertion`.

### 2026-09-19 — `MailboxPolicy.defaults` (optional)

- `getMailboxPolicy()` now types the server's config values as optional `defaults`, for web-client's "Reset to server
  default" on the mailbox policy form. Optional on purpose: an older `@rapidmx/restapi` doesn't send it, and the form shows
  no reset button then. `updateMailboxPolicy()` takes `Partial<Omit<MailboxPolicy, "defaults">>` - it is read-only.
  Type-only change, so no test; `tsc --noEmit` clean.

### 2026-09-20 — Clipboard, push client, address formatting, send-failure details, username fallback

Not committed. Consumed by `web-client` through a copy of the built `dist` over its `node_modules` copy (see that repo's NOTES) - no patch.

- **`util/clipboard.ts`, `util/useCopyToClipboard.ts`, `components/buttons/CopyButton.tsx`.** `copyTextToClipboard()` tries the async Clipboard API, then a
  hidden readonly textarea + `execCommand("copy")` (focus restored), and never rejects; `false` with no DOM. The hook keeps `copied`/`failed`
  for 2 s and is unmount-safe. `CopyButton` always renders its `role="status"` live region so the change is announced; the accessible name is
  the `label`. Existing copy code in `KeyEnrollmentGate` and the encryption settings page was not touched (no behavior change requested).
- **`mail/pushClient.ts`** (protocol notes in its doc comment - the WebSocket is `/push`, events are raw `{type,action,data}` with no channel,
  50 channels/user across tabs). Reconnect delay is "equal jitter" (half fixed, half random) from 1 s doubling to 60 s and is reset on the
  server's `id: 0` greeting, not on `open` (a socket closed at once for the 10-socket cap never gets one). Only channels this client itself
  had granted are unsubscribed. `getPushClient()` is the per-tab singleton, `resetPushClient()` for tests. Node now ships a global `WebSocket`,
  so "no window" (no origin) - not "no WebSocket" - is what makes it inert during SSR.
- **`mail/mailAddress.ts`** - the shared formatter. Coexists with `compose/recipients.ts`' `formatRecipient` (web-client, for compose fields) and
  `composeQuoting.recipientDisplayName()` (drops a name that is a different address); `formatMailAddress()` keeps such a name (quoted) so it can be
  seen, and reduces a name that is the whole From header to the name. Web-client's `checkSenderName()` remains the spoofing warning.
- **`mail/sendFailure.ts`** + `ApiRequestError.details` + `apiOrigin()` - see the release notes. `getMessageRawContent()` builds its own
  `ApiRequestError` and does not carry `details`.
- **`auth/profileApi.ts`**: `getMyUsername()`, `profileInitials(profile, uid, username?)`.
- **`util/api.ts` doc** now describes the `api-104` -> `/auth/elevate` flow.
- `buildForwardQuote()`'s To line now includes addresses (test updated). The mailbox auto-provision typing was extended and **reverted** (coordinator
  narrowed the task); `MailboxAutoProvisionResult`/`autoProvisionMailbox()` are as before.
- `tsconfig.test.json` has 3 pre-existing errors (`useBranding.test`, `escrowKeys.test`, `retainedEncryptionKeys.test`).
- Verified: `yarn tsc --noEmit` clean, `yarn lint` clean, `yarn vitest run --coverage` 92 files / 1174 tests passing, coverage 100 / 99.4 / 100 / 100 (branch
  threshold 98, its documented exceptions unchanged); every new file is at 100%.

### 2026-09-20 (later) - PKI, ASN.1 and Argon2 libraries load on first use (`crypto/keys.ts`, `passwordUnlock.ts`, `masterKeyWraps.ts`)

Found while cutting the inbox route's initial JavaScript in web-client: `keySession.ts` is reached by every page's shell, and through
`keys.ts` (`@peculiar/x509`), `passwordUnlock.ts` (`hash-wasm`) and `masterKeyWraps.ts` (`smime.ts`: PKI.js, X.509, ASN.1) it pulled about 1 MB of
libraries into every page although they are only used for key setup, a password unlock or an escrow wrap.
- `keys.ts`: `loadX509()` awaits `reflect-metadata` on its own, then imports `@peculiar/x509` and sets its crypto provider; `generateKeyPairWithCsr()`
  calls it first. `tsyringe` (an x509 dependency) throws "tsyringe requires a reflect polyfill" if it evaluates before the polyfill, and with
  `strictExecutionOrder` (server `serverViteConfig.ts`) a static import order isn't enough once the module is lazy - so the polyfill is its own `await`.
- `passwordUnlock.ts`: `deriveFromPassword()` imports `hash-wasm` itself. `masterKeyWraps.ts`: `buildEscrowWrap()` imports `./smime.js`.
- Public signatures are unchanged (both were already async). Unit tests are unchanged; the lazy order is covered by the existing suites with real modules.
- **Re-created after the react-shared folder was wiped (2026-09-20).** The original commit `5fc261b` was local and never pushed. The source was rebuilt from
  the compiled `dist` that web-client's `node_modules` still held: after re-applying the edits, `tsc` output of all 172 files (`.js` and `.d.ts`) was
  byte-identical to that copy. One detail that matters for the `.d.ts`: keep a blank line between the file's header comment and the `loadX509` comment in
  `keys.ts`, or the header is emitted into `keys.d.ts`.
- **Not verified:** a browser-level encrypted send/receive round trip after this change; the load order is exercised by unit tests only.
