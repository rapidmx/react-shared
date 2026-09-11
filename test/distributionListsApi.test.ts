// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyResponse, jsonResponse, mockFetch } from "./testUtils.js";
import {
    createDistributionList,
    deleteDistributionList,
    getDistributionList,
    listDistributionLists,
    updateDistributionList,
} from "../src/distributionListsApi.js";

const list = {
    uid: "team@example.com",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    primarySmtpAddress: "team@example.com",
    name: "Team",
    memberAddresses: [],
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("listDistributionLists", () => {
    it("fetches with default pagination", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, [list]));
        const result = await listDistributionLists();
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/distribution-lists?limit=25&page=0", expect.anything());
        expect(result).toEqual([list]);
    });

    it("forwards a custom page/limit", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listDistributionLists({ page: 2, limit: 10 });
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/distribution-lists?limit=10&page=2", expect.anything());
    });
});

describe("getDistributionList", () => {
    it("fetches the encoded uid", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, list));
        const result = await getDistributionList("team@example.com");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/distribution-lists/team%40example.com", expect.anything());
        expect(result).toEqual(list);
    });
});

describe("createDistributionList", () => {
    it("posts the input with aliasAddresses/memberAddresses defaults", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, list));
        await createDistributionList({ primarySmtpAddress: "team@example.com", name: "Team" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/distribution-lists",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    aliasAddresses: [],
                    memberAddresses: [],
                    primarySmtpAddress: "team@example.com",
                    name: "Team",
                }),
            }),
        );
    });

    it("forwards explicit aliasAddresses/memberAddresses instead of the defaults", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, list));
        await createDistributionList({
            primarySmtpAddress: "team@example.com",
            name: "Team",
            aliasAddresses: ["alt@example.com"],
            memberAddresses: ["a@example.com"],
        });
        const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
        expect(body.aliasAddresses).toEqual(["alt@example.com"]);
        expect(body.memberAddresses).toEqual(["a@example.com"]);
    });
});

describe("updateDistributionList", () => {
    it("PUTs the encoded uid with the input", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ...list, name: "Renamed" }));
        const result = await updateDistributionList({ uid: "team@example.com", version: 0, name: "Renamed" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/distribution-lists/team%40example.com",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({ uid: "team@example.com", version: 0, name: "Renamed" }),
            }),
        );
        expect(result.name).toBe("Renamed");
    });
});

describe("deleteDistributionList", () => {
    it("DELETEs the encoded uid with the version query param", async () => {
        const fetchMock = mockFetch(() => emptyResponse(200));
        await deleteDistributionList("team@example.com", 3);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/distribution-lists/team%40example.com?version=3",
            expect.objectContaining({ method: "DELETE" }),
        );
    });
});
