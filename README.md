# RapidMX: React Shared

[![CI](https://github.com/RapidMX/react-shared/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/RapidMX/react-shared/actions/workflows/build.yml)
[![Coverage Status](https://coveralls.io/repos/github/RapidMX/react-shared/badge.svg?branch=main)](https://coveralls.io/github/RapidMX/react-shared?branch=main)
[![npm version](https://img.shields.io/npm/v/@rapidmx/react-shared)](https://www.npmjs.com/package/@rapidmx/react-shared)

A library containing platform-agnostic components/data/business-logic for RapidMX's React frontends.

This library is used by:

[`rapidmx/server`](https://github.com/RapidMX/server)'s own server-rendered pages,
[`@rapidmx/web-client`](https://github.com/RapidMX/web-client), and
[`@rapidmx/electron-client`](https://github.com/RapidMX/electron-client).

This package is deliberately framework-free beyond React itself — no router, no HTTP client, no state
management library. `src/` is organized by feature/system, mirroring `@rapidmx/restapi`'s own
`src/<feature>/` convention: `mail/`, `calendar/`, `contacts/`, `tasks/`, `admin/`, `branding/`,
`search/`, `auth/`, and `util/` for the small set of things every feature depends on (`api.ts`'s
`apiFetch()`, `apiQuery.ts`'s pagination helper, `dateInput.ts`, `useIsMobile.ts`, `clipboard.ts`'s `copyTextToClipboard()` and its `useCopyToClipboard.ts` hook). Each `*Api.ts` module is
a thin `fetch` wrapper around one [`@rapidmx/restapi`](https://github.com/RapidMX/restapi) resource, and a
handful of `use*` hooks and pure utilities (recurrence expansion, vCard/ICS helpers, emoji data, calendar
color assignment, `mail/mailAddress.ts`'s `Name <address>` formatting) back the UI components each consumer builds
independently. `mail/pushClient.ts` is the one real-time connection a tab keeps to the server's `/push` WebSocket
(subscribe to folder/mailbox uids, reconnect with backoff, close on sign-out) - a consumer must still poll, since events
published while it was disconnected are never replayed.

`src/components/` holds genuinely generic UI primitives — ones with no RapidMX/webmail-domain knowledge
baked in — usable by any consumer: `buttons/Button`+`CopyButton`, `feedback/Alert`+`Skeleton`, `forms/FormField`,
`overlays/Modal`+`Drawer`+`PopoverPortal`, `avatar/ContactAvatar`, `pickers/MiniDatePicker`, and
`navigation/BottomTabBar`. Domain-specific components (calendar views, mail compose, contact/task/admin
UI, etc.) stay in `@rapidmx/web-client`, which depends on this package rather than the other way around.

## Usage

Every module is published as its own subpath import — there is no single barrel/root export — so a consumer
only pulls in the modules it actually uses:

```ts
import { apiFetch, configureApiBaseUrl } from "@rapidmx/react-shared/util/api.js";
import { getMailboxes } from "@rapidmx/react-shared/mail/mailApi.js";
import { useRedirectIfUnauthenticated } from "@rapidmx/react-shared/auth/session.js";
import Button from "@rapidmx/react-shared/components/buttons/Button.js";
```

`apiFetch()` targets a same-origin relative path (`/api/...`) by default, matching every consumer that's
server-rendered or otherwise served from the same origin as the API it calls. A consumer whose own origin
genuinely differs from the RapidMX server's — e.g. `@rapidmx/electron-client`'s renderer — calls
`configureApiBaseUrl()` once at startup to target an absolute origin instead; see `src/util/api.ts` for the
CORS/cookie configuration that requires on the server side.

## Status

This library is under active development. It was extracted verbatim from `rapidmx/server`'s
`apps/shared/lib` so it could be versioned and consumed independently by `@rapidmx/web-client` and
`@rapidmx/electron-client` — see `CHANGELOG.md` for the split's own history.
