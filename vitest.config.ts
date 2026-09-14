import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        // Most of this package is plain fetch/logic with no DOM - Modal.tsx/Drawer.tsx (portal-based)
        // and any hook test that needs one opt into jsdom individually via a `// @vitest-environment
        // jsdom` docblock at the top of that test file, matching server's own convention (see that
        // repo's vitest.config.ts) - `environmentMatchGlobs` was removed in Vitest 4.
        environment: "node",
        setupFiles: ["./test/setup.ts"],
        include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
        // Pins the test process's local timezone to UTC - components/pickers/MiniDatePicker.tsx (moved
        // in from web-client) uses date-fns's local-time-aware functions, so a UTC ISO fixture and its
        // own local-time calculations only agree everywhere the suite runs if both sides pin the same
        // zone. Carried over verbatim from web-client's own vitest.config.ts, which hit this for real.
        env: { TZ: "UTC" },
        fileParallelism: false,
        pool: "forks",
        clearMocks: true,
        coverage: {
            enabled: true,
            provider: "v8",
            include: ["src/**/*.ts", "src/**/*.tsx"],
            exclude: ["**/node_modules/**", "**/test/**"],
            reporter: ["text", "json", "html", "lcov"],
            thresholds: {
                "src/**": {
                    // Branches held at 98 (not 100), covering two independently-justified, deliberate
                    // gaps - not a general excuse to skip branch coverage elsewhere. Vitest's thresholds
                    // are an aggregate across every file matched by a glob, not a per-file minimum
                    // (confirmed: a second, more specific glob entry just naming one file doesn't carve
                    // it out of the aggregate), so each of these relaxes the whole package by a few
                    // branches, not just their own file.
                    //
                    // 1. useBranding.ts's stylesheet-link effect has a `!link` "reuse an existing link"
                    //    branch that's unreachable through the public hook - `branding` starts `null` on
                    //    every mount, so this effect's own first run (before the fetch resolves) always
                    //    takes the "no stylesheetUrl yet" path and removes any existing link first; by
                    //    the time branding loads, the link is already gone, so a new one is always
                    //    created rather than reused. See test/useBranding.test.tsx's 2026-09-11 test for
                    //    the actual (doc-comment-contradicting) behavior this documents - worth JP's own
                    //    look as a possible real fix, not changed here.
                    // 2. smime.ts has one branch unreachable through its own public API surface,
                    //    documented inline at its exact location: `decryptEnvelopedData()`'s
                    //    non-Error-thrown fallback (only reachable with zero recipientInfos, which
                    //    `encryptForRecipients()` never produces in practice). The former
                    //    `certificates?.[0] instanceof Certificate` branches are gone: verification now
                    //    uses the certificate pkijs matched to the SignerInfo (round-3 review, PoC 2).
                    // 3. queryGrammar.ts#extractFirst()'s `match[2] ?? match[3] ?? ""` fallback - the
                    //    regex it follows requires one of group 2 (quoted value) or group 3 (bare value)
                    //    whenever it matches at all, so the `?? ""` arm is unreachable.
                    // 4. searchTier3.ts's `security.subject ?? ""` - `ProtectedHeaders.subject` is a
                    //    required (non-optional) string field, so whenever `MessageSecurityResult.subject`
                    //    is set at all (which the surrounding `!security.html && !security.subject` guard
                    //    already requires before this line is reached), it is never `undefined`.
                    branches: 98,
                    functions: 100,
                    lines: 100,
                    statements: 100,
                },
            },
            reportsDirectory: "coverage",
        },
        reporters: ["default", "junit"],
        outputFile: {
            junit: "junit.xml",
        },
    },
});
