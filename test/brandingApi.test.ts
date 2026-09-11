// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyResponse, jsonResponse, mockFetch } from "./testUtils.js";
import {
    Branding,
    deleteBrandingIcon,
    deleteBrandingLogo,
    deleteBrandingStylesheet,
    getBranding,
    updateBranding,
    uploadBrandingIcon,
    uploadBrandingLogo,
    uploadBrandingStylesheet,
} from "../src/brandingApi.js";

const branding: Branding = { companyName: "Acme", title: "Acme Mail" };

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("getBranding", () => {
    it("fetches the singleton branding row", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, branding));
        const result = await getBranding();
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/branding", expect.anything());
        expect(result).toEqual(branding);
    });
});

describe("updateBranding", () => {
    it("PUTs the given input", async () => {
        const updated: Branding = { ...branding, title: "New Title" };
        const fetchMock = mockFetch(() => jsonResponse(200, updated));
        const result = await updateBranding({ title: "New Title" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/branding",
            expect.objectContaining({ method: "PUT", body: JSON.stringify({ title: "New Title" }) }),
        );
        expect(result).toEqual(updated);
    });
});

describe("uploadBrandingLogo", () => {
    it("posts the file's raw bytes with its own content-type, not JSON", async () => {
        const file = new File(["png-bytes"], "logo.png", { type: "image/png" });
        const updated: Branding = { ...branding, logoUrl: "/api/mail/branding/logo" };
        const fetchMock = mockFetch(() => jsonResponse(200, updated));

        const result = await uploadBrandingLogo(file);

        expect(fetchMock).toHaveBeenCalledWith("/api/mail/branding/logo", expect.objectContaining({ method: "POST", body: file }));
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        expect((init.headers as Record<string, string>)["Content-Type"]).toBe("image/png");
        expect(result).toEqual(updated);
    });

    it("falls back to application/octet-stream when the file has no type", async () => {
        const file = new File(["bytes"], "logo");
        const fetchMock = mockFetch(() => jsonResponse(200, branding));

        await uploadBrandingLogo(file);

        const init = fetchMock.mock.calls[0][1] as RequestInit;
        expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/octet-stream");
    });

    it("throws ApiRequestError using the body's message field on a non-ok response", async () => {
        const file = new File(["png-bytes"], "logo.png", { type: "image/png" });
        mockFetch(() => jsonResponse(400, { message: "too large", code: "api-101" }));

        await expect(uploadBrandingLogo(file)).rejects.toMatchObject({ message: "too large", status: 400, code: "api-101" });
    });

    it("falls back to the response's statusText when the error body has no message/error field", async () => {
        const file = new File(["png-bytes"], "logo.png", { type: "image/png" });
        mockFetch(() => new Response(null, { status: 500, statusText: "Server Error" }));

        await expect(uploadBrandingLogo(file)).rejects.toMatchObject({ message: "Server Error", status: 500 });
    });

    it("falls back to the body's error field when message is absent", async () => {
        const file = new File(["png-bytes"], "logo.png", { type: "image/png" });
        mockFetch(() => jsonResponse(400, { error: "too large" }));

        await expect(uploadBrandingLogo(file)).rejects.toMatchObject({ message: "too large" });
    });

    it("treats an unparseable JSON body as no body", async () => {
        const file = new File(["png-bytes"], "logo.png", { type: "image/png" });
        mockFetch(() => new Response("not json", { status: 200, headers: { "content-type": "application/json" } }));

        const result = await uploadBrandingLogo(file);
        expect(result).toBeUndefined();
    });

    it("falls back to the literal 'Upload failed.' when there is neither a body nor a statusText", async () => {
        const file = new File(["png-bytes"], "logo.png", { type: "image/png" });
        mockFetch(() => new Response(null, { status: 500, statusText: "" }));

        await expect(uploadBrandingLogo(file)).rejects.toMatchObject({ message: "Upload failed." });
    });
});

describe("uploadBrandingIcon", () => {
    it("posts the file's raw bytes", async () => {
        const file = new File(["png-bytes"], "icon.png", { type: "image/png" });
        const updated: Branding = { ...branding, iconUrl: "/api/mail/branding/icon" };
        const fetchMock = mockFetch(() => jsonResponse(200, updated));

        const result = await uploadBrandingIcon(file);

        expect(fetchMock).toHaveBeenCalledWith("/api/mail/branding/icon", expect.objectContaining({ method: "POST", body: file }));
        expect(result).toEqual(updated);
    });
});

describe("uploadBrandingStylesheet", () => {
    it("posts the file's raw bytes", async () => {
        const file = new File(["body{}"], "theme.css", { type: "text/css" });
        const updated: Branding = { ...branding, stylesheetUrl: "/api/mail/branding/stylesheet" };
        const fetchMock = mockFetch(() => jsonResponse(200, updated));

        const result = await uploadBrandingStylesheet(file);

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/branding/stylesheet",
            expect.objectContaining({ method: "POST", body: file }),
        );
        expect(result).toEqual(updated);
    });
});

describe("deleteBrandingLogo", () => {
    it("DELETEs the logo", async () => {
        const fetchMock = mockFetch(() => emptyResponse(204));
        await deleteBrandingLogo();
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/branding/logo", expect.objectContaining({ method: "DELETE" }));
    });
});

describe("deleteBrandingIcon", () => {
    it("DELETEs the icon", async () => {
        const fetchMock = mockFetch(() => emptyResponse(204));
        await deleteBrandingIcon();
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/branding/icon", expect.objectContaining({ method: "DELETE" }));
    });
});

describe("deleteBrandingStylesheet", () => {
    it("DELETEs the stylesheet", async () => {
        const fetchMock = mockFetch(() => emptyResponse(204));
        await deleteBrandingStylesheet();
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/branding/stylesheet", expect.objectContaining({ method: "DELETE" }));
    });
});
