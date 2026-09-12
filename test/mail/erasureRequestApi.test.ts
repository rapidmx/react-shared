// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../testUtils.js";
import {
    approveErasureRequest,
    createErasureRequest,
    denyErasureRequest,
    getErasureRequest,
    listErasureRequests,
} from "../../src/mail/erasureRequestApi.js";

const request = {
    uid: "der1",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    mailboxUid: "mb1",
    requestedByUserUid: "u1",
    status: "pending" as const,
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("createErasureRequest", () => {
    it("posts with no body, always the caller's own mailbox", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, request));
        const result = await createErasureRequest();
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/erasure-requests", expect.objectContaining({ method: "POST" }));
        expect(result).toEqual(request);
    });
});

describe("listErasureRequests", () => {
    it("fetches every visible request", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, [request]));
        const result = await listErasureRequests();
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/erasure-requests", expect.anything());
        expect(result).toEqual([request]);
    });
});

describe("getErasureRequest", () => {
    it("fetches the encoded uid", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, request));
        const result = await getErasureRequest("der/1");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/erasure-requests/der%2F1", expect.anything());
        expect(result).toEqual(request);
    });
});

describe("approveErasureRequest", () => {
    it("posts to the encoded uid's approve action", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ...request, status: "approved" }));
        const result = await approveErasureRequest("der/1");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/erasure-requests/der%2F1/approve",
            expect.objectContaining({ method: "POST" }),
        );
        expect(result.status).toBe("approved");
    });
});

describe("denyErasureRequest", () => {
    it("posts the reason to the encoded uid's deny action", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ...request, status: "denied", reason: "not verified" }));
        const result = await denyErasureRequest("der/1", "not verified");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/erasure-requests/der%2F1/deny",
            expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: "not verified" }) }),
        );
        expect(result.reason).toBe("not verified");
    });
});
