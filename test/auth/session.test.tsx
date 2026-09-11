// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockLocation } from "../testUtils.js";
import { useRedirectIfUnauthenticated } from "../../src/auth/session.js";

function TestComponent({ userUid, authServerUrl }: { userUid?: string; authServerUrl?: string }) {
    useRedirectIfUnauthenticated(userUid, authServerUrl);
    return null;
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("useRedirectIfUnauthenticated", () => {
    it("redirects to auth-server's sign-in page with return_to when there is no userUid", async () => {
        const location = mockLocation();
        location.href = "https://mail.example.com/admin/mailboxes";
        render(<TestComponent authServerUrl="https://auth.example.com" />);
        await waitFor(() =>
            expect(location.href).toBe(
                "https://auth.example.com/auth/signin?return_to=" +
                    encodeURIComponent("https://mail.example.com/admin/mailboxes"),
            ),
        );
    });

    it("does not redirect once userUid is present", async () => {
        const location = mockLocation();
        location.href = "https://mail.example.com/admin";
        render(<TestComponent userUid="u1" authServerUrl="https://auth.example.com" />);
        expect(location.href).toBe("https://mail.example.com/admin");
    });

    it("logs an error instead of redirecting when authServerUrl is not configured", async () => {
        const location = mockLocation();
        location.href = "https://mail.example.com/admin";
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        render(<TestComponent />);
        await waitFor(() => expect(errorSpy).toHaveBeenCalled());
        expect(location.href).toBe("https://mail.example.com/admin");
    });
});
