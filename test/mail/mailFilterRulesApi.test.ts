// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyResponse, jsonResponse, mockFetch } from "../testUtils.js";
import {
    createMailFilterRule,
    deleteMailFilterRule,
    getMailFilterRule,
    listMailFilterRules,
    updateMailFilterRule,
} from "../../src/mail/mailFilterRulesApi.js";

const rule = {
    uid: "mfr1",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    mailboxUid: "mb1",
    name: "File newsletters",
    enabled: true,
    sequence: 0,
    stopProcessingRules: false,
    conditions: {},
    actions: [],
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("listMailFilterRules", () => {
    it("fetches with the mailboxUid filter and default pagination", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, [rule]));
        const result = await listMailFilterRules("mb1");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/mail-filter-rules?limit=25&page=0&mailboxUid=mb1", expect.anything());
        expect(result).toEqual([rule]);
    });

    it("forwards a custom page/limit alongside the mailboxUid filter", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listMailFilterRules("mb1", { page: 2, limit: 10 });
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/mail-filter-rules?limit=10&page=2&mailboxUid=mb1", expect.anything());
    });
});

describe("getMailFilterRule", () => {
    it("fetches the encoded uid", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, rule));
        const result = await getMailFilterRule("mfr/1");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/mail-filter-rules/mfr%2F1", expect.anything());
        expect(result).toEqual(rule);
    });
});

describe("createMailFilterRule", () => {
    it("posts the input with enabled/sequence/stopProcessingRules/conditions/actions defaults", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, rule));
        await createMailFilterRule({ mailboxUid: "mb1", name: "File newsletters" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/mail-filter-rules",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    enabled: true,
                    sequence: 0,
                    stopProcessingRules: false,
                    conditions: {},
                    actions: [],
                    mailboxUid: "mb1",
                    name: "File newsletters",
                }),
            }),
        );
    });

    it("forwards explicit conditions/actions instead of the defaults", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, rule));
        await createMailFilterRule({
            mailboxUid: "mb1",
            name: "File newsletters",
            enabled: false,
            sequence: 5,
            stopProcessingRules: true,
            conditions: { hasAttachment: true },
            actions: [{ type: "delete" }],
        });
        const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
        expect(body.enabled).toBe(false);
        expect(body.sequence).toBe(5);
        expect(body.stopProcessingRules).toBe(true);
        expect(body.conditions).toEqual({ hasAttachment: true });
        expect(body.actions).toEqual([{ type: "delete" }]);
    });
});

describe("updateMailFilterRule", () => {
    it("PUTs the encoded uid with the input", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ...rule, name: "Renamed" }));
        const result = await updateMailFilterRule({ uid: "mfr1", version: 0, name: "Renamed" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/mail-filter-rules/mfr1",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({ uid: "mfr1", version: 0, name: "Renamed" }),
            }),
        );
        expect(result.name).toBe("Renamed");
    });
});

describe("deleteMailFilterRule", () => {
    it("DELETEs the encoded uid with the version query param", async () => {
        const fetchMock = mockFetch(() => emptyResponse(200));
        await deleteMailFilterRule("mfr1", 3);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/mail-filter-rules/mfr1?version=3",
            expect.objectContaining({ method: "DELETE" }),
        );
    });
});
