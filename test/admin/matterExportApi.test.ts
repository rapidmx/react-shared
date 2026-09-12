// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../testUtils.js";
import {
    createMatterExportRequest,
    getMatterExportRequest,
    listMatterExportRequests,
    matterExportRequestDownloadUrl,
} from "../../src/admin/matterExportApi.js";

const request = {
    uid: "mer1",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    matterId: "m1",
    requestedByUserUid: "u1",
    status: "pending" as const,
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("createMatterExportRequest", () => {
    it("posts the matterId", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, request));
        const result = await createMatterExportRequest("m1");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/escrow/matter-export-requests",
            expect.objectContaining({ method: "POST", body: JSON.stringify({ matterId: "m1" }) }),
        );
        expect(result).toEqual(request);
    });
});

describe("listMatterExportRequests", () => {
    it("fetches every request the caller holds a scope for", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, [request]));
        const result = await listMatterExportRequests();
        expect(fetchMock).toHaveBeenCalledWith("/api/escrow/matter-export-requests", expect.anything());
        expect(result).toEqual([request]);
    });
});

describe("getMatterExportRequest", () => {
    it("fetches the encoded uid", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, request));
        const result = await getMatterExportRequest("mer/1");
        expect(fetchMock).toHaveBeenCalledWith("/api/escrow/matter-export-requests/mer%2F1", expect.anything());
        expect(result).toEqual(request);
    });
});

describe("matterExportRequestDownloadUrl", () => {
    it("builds the same-origin download URL for an encoded uid", () => {
        expect(matterExportRequestDownloadUrl("mer/1")).toBe("/api/escrow/matter-export-requests/mer%2F1/download");
    });
});
