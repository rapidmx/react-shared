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
management library. Each `*Api.ts` module is a thin `fetch` wrapper around one
[`@rapidmx/restapi`](https://github.com/RapidMX/restapi) resource (mail, calendar, contacts, tasks, booking,
branding, domains, etc.), and a handful of `use*` hooks and pure utilities (recurrence expansion, vCard/ICS
helpers, emoji data, calendar color assignment) back the UI components each consumer builds independently.

## Usage

Every module is published as its own subpath import — there is no single barrel/root export — so a consumer
only pulls in the modules it actually uses:

```ts
import { apiFetch, configureApiBaseUrl } from "@rapidmx/react-shared/api.js";
import { getMailboxes } from "@rapidmx/react-shared/mailApi.js";
import { useRedirectIfUnauthenticated } from "@rapidmx/react-shared/session.js";
```

`apiFetch()` targets a same-origin relative path (`/api/...`) by default, matching every consumer that's
server-rendered or otherwise served from the same origin as the API it calls. A consumer whose own origin
genuinely differs from the RapidMX server's — e.g. `@rapidmx/electron-client`'s renderer — calls
`configureApiBaseUrl()` once at startup to target an absolute origin instead; see `src/api.ts` for the
CORS/cookie configuration that requires on the server side.

## Status

This library is under active development. It was extracted verbatim from `rapidmx/server`'s
`apps/shared/lib` so it could be versioned and consumed independently by `@rapidmx/web-client` and
`@rapidmx/electron-client` — see `CHANGELOG.md` for the split's own history.
