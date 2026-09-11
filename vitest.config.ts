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
        fileParallelism: false,
        pool: "forks",
        clearMocks: true,
        coverage: {
            enabled: true,
            provider: "v8",
            include: ["src/**/*.ts", "src/**/*.tsx"],
            exclude: ["**/node_modules/**", "**/test/**"],
            reporter: ["text", "json", "html", "lcov"],
            reportsDirectory: "coverage",
        },
        reporters: ["default", "junit"],
        outputFile: {
            junit: "junit.xml",
        },
    },
});
