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
