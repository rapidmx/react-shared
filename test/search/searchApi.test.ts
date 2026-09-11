// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../testUtils.js";
import { search } from "../../src/search/searchApi.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("search", () => {
    it("fetches with just the query text when no other params are given", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { results: [] }));
        const result = await search("hello");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/search?q=hello", expect.anything());
        expect(result).toEqual({ results: [] });
    });

    it("forwards types/cursor/limit when provided", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { results: [], nextCursor: "c1" }));
        const result = await search("hello", { types: ["message", "contact"], cursor: "c0", limit: 10 });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/search?q=hello&types=message%2Ccontact&cursor=c0&limit=10",
            expect.anything(),
        );
        expect(result.nextCursor).toBe("c1");
    });

    it("omits types/cursor/limit that are not provided", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { results: [] }));
        await search("q");
        const [url] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/mail/search?q=q");
    });
});
