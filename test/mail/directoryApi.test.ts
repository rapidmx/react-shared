// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../testUtils.js";
import {
    fetchRecipientSuggestions,
    mergeRecipientSuggestions,
    RecipientSuggestion,
    RECIPIENT_SUGGESTION_MAX_QUERY_LENGTH,
    searchContactSuggestions,
    searchDirectory,
} from "../../src/mail/directoryApi.js";
import { ApiRequestError } from "../../src/util/api.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

const alice: RecipientSuggestion = { displayName: "Alice Johnson", address: "alice@example.com", kind: "user" };
const aliceContact: RecipientSuggestion = { displayName: "Alice (home)", address: "ALICE@example.com", kind: "contact" };
const sales: RecipientSuggestion = { displayName: "Sales", address: "sales@example.com", kind: "list" };

describe("searchDirectory", () => {
    it("sends the trimmed query and limit, and keeps only well-formed entries", async () => {
        const fetchMock = mockFetch(() =>
            jsonResponse(200, [alice, { address: "noname@example.com", kind: "shared" }, { displayName: "No address" }, null, { address: "" }]),
        );
        expect(await searchDirectory("  al ice ", { limit: 5 })).toEqual([alice, { displayName: "", address: "noname@example.com", kind: "shared" }]);
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/directory?q=al+ice&limit=5", expect.anything());
    });

    it("omits the limit when not given, passes the abort signal, and treats a non-array body as no entries", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { unexpected: true }));
        const controller = new AbortController();
        expect(await searchDirectory("al", { signal: controller.signal })).toEqual([]);
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/directory?q=al", expect.objectContaining({ signal: controller.signal }));
    });

    it("doesn't request a query shorter than two characters, and cuts a long one", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        expect(await searchDirectory(" a ")).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
        await searchDirectory("x".repeat(150));
        expect(fetchMock).toHaveBeenCalledWith(`/api/mail/directory?q=${"x".repeat(RECIPIENT_SUGGESTION_MAX_QUERY_LENGTH)}`, expect.anything());
    });

    it("rejects with the server's error", async () => {
        mockFetch(() => jsonResponse(403, { message: "Only users with a mailbox on this server can search its directory." }));
        await expect(searchDirectory("al")).rejects.toMatchObject({ status: 403 });
    });
});

describe("searchContactSuggestions", () => {
    it("sends the query, limit and mailboxUid", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, [aliceContact]));
        expect(await searchContactSuggestions("ali", { limit: 3, mailboxUid: "mb/1" })).toEqual([aliceContact]);
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/directory/contacts?q=ali&limit=3&mailboxUid=mb%2F1", expect.anything());
    });

    it("sends just the query by default", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await searchContactSuggestions("a&b");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/directory/contacts?q=a%26b", expect.anything());
    });
});

describe("mergeRecipientSuggestions", () => {
    it("puts contacts first, drops repeated addresses case-insensitively and keeps the limit", () => {
        expect(mergeRecipientSuggestions([aliceContact], [alice, sales])).toEqual([aliceContact, sales]);
        expect(mergeRecipientSuggestions([aliceContact, { ...sales, address: " Sales@example.com " }], [alice, sales], 10)).toEqual([
            aliceContact,
            { ...sales, address: " Sales@example.com " },
        ]);
        expect(mergeRecipientSuggestions([aliceContact], [alice, sales], 1)).toEqual([aliceContact]);
    });
});

describe("fetchRecipientSuggestions", () => {
    const route = (handlers: { contacts: () => Response | Promise<Response>; directory: () => Response | Promise<Response> }) =>
        mockFetch((url) => (url.startsWith("/api/mail/directory/contacts") ? handlers.contacts() : handlers.directory()));

    it("merges both sources with the default limit", async () => {
        const fetchMock = route({ contacts: () => jsonResponse(200, [aliceContact]), directory: () => jsonResponse(200, [alice, sales]) });
        expect(await fetchRecipientSuggestions("al", { mailboxUid: "mb1" })).toEqual([aliceContact, sales]);
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/directory/contacts?q=al&limit=8&mailboxUid=mb1", expect.anything());
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/directory?q=al&limit=8", expect.anything());
    });

    it("keeps one source's entries when the other fails", async () => {
        route({ contacts: () => jsonResponse(200, [aliceContact]), directory: () => jsonResponse(403, { message: "no" }) });
        expect(await fetchRecipientSuggestions("al", { limit: 2 })).toEqual([aliceContact]);
        route({ contacts: () => jsonResponse(500, { message: "down" }), directory: () => jsonResponse(200, [sales]) });
        expect(await fetchRecipientSuggestions("al")).toEqual([sales]);
    });

    it("rejects when both sources fail", async () => {
        route({ contacts: () => jsonResponse(429, { message: "slow down" }), directory: () => jsonResponse(403, { message: "no" }) });
        await expect(fetchRecipientSuggestions("al")).rejects.toMatchObject({ status: 429 });
        route({ contacts: () => Promise.reject("offline"), directory: () => Promise.reject("offline") });
        const error = await fetchRecipientSuggestions("al").catch((e) => e);
        expect(error).toBeInstanceOf(ApiRequestError);
    });

    it("rejects with the AbortError when aborted", async () => {
        const abort = () => Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
        route({ contacts: () => jsonResponse(200, [aliceContact]), directory: abort });
        await expect(fetchRecipientSuggestions("al")).rejects.toMatchObject({ name: "AbortError" });
        route({ contacts: abort, directory: () => jsonResponse(200, []) });
        await expect(fetchRecipientSuggestions("al")).rejects.toMatchObject({ name: "AbortError" });
    });

    it("makes no request for a short query", async () => {
        const fetchMock = route({ contacts: () => jsonResponse(200, []), directory: () => jsonResponse(200, []) });
        expect(await fetchRecipientSuggestions("a")).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
