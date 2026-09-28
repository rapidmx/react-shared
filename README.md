# RapidMX: React Shared

[![npm version](https://img.shields.io/npm/v/@rapidmx/react-shared)](https://www.npmjs.com/package/@rapidmx/react-shared)

**This package has been merged into [`@rapidmx/web-client`](https://github.com/RapidMX/web-client), as of
2026-09-27.** Investigation at the time found that every real consumer of this package
(`booking-plugin`, `meet-plugin`, `rapidmx/server`, `tauri-client`, and `@rapidmx/web-client` itself)
already depended on `@rapidmx/web-client` too - nothing anywhere used `@rapidmx/react-shared` without
also using `@rapidmx/web-client` - so maintaining this as a separate package no longer served a purpose.

This repository's `src/` and `test/` have been removed; there is nothing left here to build or test.
What used to live here now lives at `@rapidmx/web-client`'s own `lib/` directory, published under
`@rapidmx/web-client/lib/<path>.js` instead of `@rapidmx/react-shared/<path>.js`:

```diff
- import { apiFetch } from "@rapidmx/react-shared/util/api.js";
+ import { apiFetch } from "@rapidmx/web-client/lib/util/api.js";
```

See [`@rapidmx/web-client`'s own README.md](https://github.com/RapidMX/web-client#readme) (the `lib/` section) for
what that directory contains and how it's organized - unchanged from this package's own former `src/` layout - and
that repository's `.claude/NOTES.md` (2026-09-27 entry) for the full story of the merge.

This repository is not otherwise archived or deleted - that remains a separate, later decision.
