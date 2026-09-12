// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyResponse, jsonResponse, mockFetch } from "../testUtils.js";
import {
    createEscrowScope,
    deleteEscrowScope,
    getEscrowScope,
    listEscrowScopes,
    updateEscrowScope,
} from "../../src/admin/escrowScopesApi.js";

const publicKey = {
    publicKey: "base64cert",
    type: "x509",
    fingerprint: "abc123",
    notBefore: 1735689600000,
    notAfter: 1767225600000,
};

const scope = {
    uid: "es1",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    name: "Legal Hold Q1",
    description: "eDiscovery scope",
    publicKey,
    holderUserUids: ["u1", "u2"],
    requiredHolders: 2,
    notifySubjectOnAccess: false,
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("listEscrowScopes", () => {
    it("fetches with default pagination", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, [scope]));
        const result = await listEscrowScopes();
        expect(fetchMock).toHaveBeenCalledWith("/api/escrow/scopes?limit=25&page=0", expect.anything());
        expect(result).toEqual([scope]);
    });

    it("forwards a custom page/limit", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listEscrowScopes({ page: 2, limit: 10 });
        expect(fetchMock).toHaveBeenCalledWith("/api/escrow/scopes?limit=10&page=2", expect.anything());
    });
});

describe("getEscrowScope", () => {
    it("fetches the encoded uid", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, scope));
        const result = await getEscrowScope("es/1");
        expect(fetchMock).toHaveBeenCalledWith("/api/escrow/scopes/es%2F1", expect.anything());
        expect(result).toEqual(scope);
    });
});

describe("createEscrowScope", () => {
    it("posts the input with a notifySubjectOnAccess default", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, scope));
        await createEscrowScope({
            name: "Legal Hold Q1",
            publicKey,
            holderUserUids: ["u1", "u2"],
            requiredHolders: 2,
        });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/escrow/scopes",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    notifySubjectOnAccess: false,
                    name: "Legal Hold Q1",
                    publicKey,
                    holderUserUids: ["u1", "u2"],
                    requiredHolders: 2,
                }),
            }),
        );
    });

    it("forwards an explicit notifySubjectOnAccess instead of the default", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, scope));
        await createEscrowScope({
            name: "Legal Hold Q1",
            publicKey,
            holderUserUids: ["u1"],
            requiredHolders: 1,
            notifySubjectOnAccess: true,
        });
        const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
        expect(body.notifySubjectOnAccess).toBe(true);
    });
});

describe("updateEscrowScope", () => {
    it("PUTs the encoded uid with the input", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ...scope, name: "Renamed" }));
        const result = await updateEscrowScope({ uid: "es1", version: 0, name: "Renamed" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/escrow/scopes/es1",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({ uid: "es1", version: 0, name: "Renamed" }),
            }),
        );
        expect(result.name).toBe("Renamed");
    });
});

describe("deleteEscrowScope", () => {
    it("DELETEs the encoded uid with the version query param", async () => {
        const fetchMock = mockFetch(() => emptyResponse(200));
        await deleteEscrowScope("es1", 3);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/escrow/scopes/es1?version=3",
            expect.objectContaining({ method: "DELETE" }),
        );
    });
});
