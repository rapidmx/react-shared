# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/rapidmx/react-shared/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/rapidmx/react-shared/releases/tag/v0.2.0
