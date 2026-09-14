// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyResponse, jsonResponse, mockFetch } from "../testUtils.js";
import {
    addPlugin,
    expectedPlanOf,
    getPluginStatus,
    getPluginUpdates,
    listPluginNamespaces,
    searchPlugins,
    listPlugins,
    lookupPluginPackage,
    planPluginChange,
    removePlugin,
    updatePlugin,
} from "../../src/admin/pluginsApi.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("pluginsApi", () => {
    it("lists plugins and reads their status", async () => {
        const fetchMock = mockFetch((url) => jsonResponse(200, url.endsWith("/status") ? { hash: "h", instances: [] } : []));
        expect(await listPlugins()).toEqual([]);
        expect(await getPluginStatus()).toEqual({ hash: "h", instances: [] });
        expect(fetchMock).toHaveBeenCalledWith("/api/system/plugins", expect.anything());
        expect(fetchMock).toHaveBeenCalledWith("/api/system/plugins/status", expect.anything());
    });

    it("looks a package up with its scoped name encoded, optionally at a version", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, {}));
        await lookupPluginPackage("@rapidmx/activesync");
        await lookupPluginPackage("@rapidmx/activesync", "1.0.0-beta.1");
        expect(fetchMock).toHaveBeenCalledWith("/api/system/plugins/registry/%40rapidmx%2Factivesync", expect.anything());
        expect(fetchMock).toHaveBeenCalledWith("/api/system/plugins/registry/%40rapidmx%2Factivesync?packageVersion=1.0.0-beta.1", expect.anything());
    });

    it("adds, updates and removes a plugin", async () => {
        const fetchMock = mockFetch((_url, init) => (init?.method === "DELETE" ? emptyResponse(204) : jsonResponse(200, { uid: "p1" })));
        await addPlugin("@rapidmx/mapi", "1.0.0");
        await updatePlugin("p1", { version: 2, enabled: false, settings: { "mail:x": null } });
        await removePlugin("p1");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/system/plugins",
            expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "@rapidmx/mapi", packageVersion: "1.0.0" }) }),
        );
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/system/plugins/p1",
            expect.objectContaining({ method: "PUT", body: JSON.stringify({ version: 2, enabled: false, settings: { "mail:x": null } }) }),
        );
        expect(fetchMock).toHaveBeenCalledWith("/api/system/plugins/p1", expect.objectContaining({ method: "DELETE" }));
    });

    it("sends the confirmed plan with an add or update", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { uid: "p1" }));
        const expectedPlan = expectedPlanOf({
            install: [{ name: "@rapidmx/mapi", version: "1.0.0", integrity: "sha512-x", manifest: { apiVersion: 1, displayName: "MAPI" } }],
            enable: ["@rapidmx/activesync"],
        });
        expect(expectedPlan).toEqual({ install: [{ name: "@rapidmx/mapi", version: "1.0.0" }], enable: ["@rapidmx/activesync"] });
        expect(expectedPlanOf({ plugin: { version: "2.0.0" }, install: [], enable: [] })).toEqual({ version: "2.0.0", install: [], enable: [] });
        await addPlugin("@rapidmx/autodiscover-plugin", "2.0.0", expectedPlan);
        await updatePlugin("p1", { version: 2, enabled: true, expectedPlan: { install: [], enable: [] } });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/system/plugins",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ name: "@rapidmx/autodiscover-plugin", packageVersion: "2.0.0", expectedPlan }),
            }),
        );
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/system/plugins/p1",
            expect.objectContaining({ method: "PUT", body: JSON.stringify({ version: 2, enabled: true, expectedPlan: { install: [], enable: [] } }) }),
        );
    });

    it("plans a change, optionally at a version", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { install: [], enable: [], conflicts: [] }));
        expect(await planPluginChange("@rapidmx/autodiscover-plugin")).toEqual({ install: [], enable: [], conflicts: [] });
        await planPluginChange("@rapidmx/autodiscover-plugin", "1.0.0-beta.1");
        expect(fetchMock).toHaveBeenCalledWith("/api/system/plugins/plan?name=%40rapidmx%2Fautodiscover-plugin", expect.anything());
        expect(fetchMock).toHaveBeenCalledWith("/api/system/plugins/plan?name=%40rapidmx%2Fautodiscover-plugin&packageVersion=1.0.0-beta.1", expect.anything());
    });

    it("lists namespaces, searches for plugins in all or one namespace, and checks for updates", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listPluginNamespaces();
        await searchPlugins();
        await searchPlugins("@my-company");
        await getPluginUpdates();
        expect(fetchMock).toHaveBeenCalledWith("/api/system/plugins/namespaces", expect.anything());
        expect(fetchMock).toHaveBeenCalledWith("/api/system/plugins/search", expect.anything());
        expect(fetchMock).toHaveBeenCalledWith("/api/system/plugins/search?namespace=%40my-company", expect.anything());
        expect(fetchMock).toHaveBeenCalledWith("/api/system/plugins/updates", expect.anything());
    });
});
