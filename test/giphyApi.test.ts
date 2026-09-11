// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "./testUtils.js";
import { searchGifs } from "../src/giphyApi.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("searchGifs", () => {
    it("sends the trimmed query as q", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await searchGifs("  cats  ");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/giphy/search?q=cats", expect.anything());
    });

    it("omits q entirely for an empty/whitespace-only query, returning the trending feed", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await searchGifs("   ");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/giphy/search?", expect.anything());
    });

    it("resolves with the parsed GIF list", async () => {
        const gifs = [{ id: "1", previewUrl: "p", url: "u", title: "t" }];
        mockFetch(() => jsonResponse(200, gifs));
        await expect(searchGifs("cats")).resolves.toEqual(gifs);
    });
});
