// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyResponse, jsonResponse, mockFetch } from "../testUtils.js";
import { closeMatter, createMatter, deleteMatter, getMatter, listMatters, updateMatter } from "../../src/admin/mattersApi.js";

const matter = {
    uid: "m1",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    name: "Smith v. Acme",
    description: "Wrongful termination",
    escrowScopeId: "es1",
    custodianMailboxUids: ["mb1", "mb2"],
    dateRangeStart: "2025-01-01T00:00:00.000Z",
    dateRangeEnd: "2025-12-31T00:00:00.000Z",
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("listMatters", () => {
    it("fetches with default pagination", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, [matter]));
        const result = await listMatters();
        expect(fetchMock).toHaveBeenCalledWith("/api/escrow/matters?limit=25&page=0", expect.anything());
        expect(result).toEqual([matter]);
    });

    it("forwards a custom page/limit", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listMatters({ page: 2, limit: 10 });
        expect(fetchMock).toHaveBeenCalledWith("/api/escrow/matters?limit=10&page=2", expect.anything());
    });
});

describe("getMatter", () => {
    it("fetches the encoded uid", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, matter));
        const result = await getMatter("m/1");
        expect(fetchMock).toHaveBeenCalledWith("/api/escrow/matters/m%2F1", expect.anything());
        expect(result).toEqual(matter);
    });
});

describe("createMatter", () => {
    it("posts the input as-is", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, matter));
        await createMatter({
            name: "Smith v. Acme",
            description: "Wrongful termination",
            escrowScopeId: "es1",
            custodianMailboxUids: ["mb1", "mb2"],
            dateRangeStart: "2025-01-01T00:00:00.000Z",
            dateRangeEnd: "2025-12-31T00:00:00.000Z",
        });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/escrow/matters",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    name: "Smith v. Acme",
                    description: "Wrongful termination",
                    escrowScopeId: "es1",
                    custodianMailboxUids: ["mb1", "mb2"],
                    dateRangeStart: "2025-01-01T00:00:00.000Z",
                    dateRangeEnd: "2025-12-31T00:00:00.000Z",
                }),
            }),
        );
    });
});

describe("updateMatter", () => {
    it("PUTs the encoded uid with the input", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ...matter, name: "Renamed" }));
        const result = await updateMatter({ uid: "m1", version: 0, name: "Renamed" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/escrow/matters/m1",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({ uid: "m1", version: 0, name: "Renamed" }),
            }),
        );
        expect(result.name).toBe("Renamed");
    });
});

describe("deleteMatter", () => {
    it("DELETEs the encoded uid with the version query param", async () => {
        const fetchMock = mockFetch(() => emptyResponse(200));
        await deleteMatter("m1", 3);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/escrow/matters/m1?version=3",
            expect.objectContaining({ method: "DELETE" }),
        );
    });
});

describe("closeMatter", () => {
    it("POSTs to the close sub-route with the encoded uid", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ...matter, closedAt: "2026-02-01T00:00:00.000Z" }));
        const result = await closeMatter("m/1");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/escrow/matters/m%2F1/close",
            expect.objectContaining({ method: "POST" }),
        );
        expect(result.closedAt).toBe("2026-02-01T00:00:00.000Z");
    });
});
