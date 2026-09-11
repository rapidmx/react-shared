// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../testUtils.js";
import { formatProfileName, getMyProfile, profileInitials } from "../../src/auth/profileApi.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("getMyProfile", () => {
    it("fetches auth-server's /profiles/me with credentials included", async () => {
        const profile = { uid: "u1", givenName: "Jane", familyName: "Doe" };
        const fetchMock = mockFetch(() => jsonResponse(200, profile));
        const result = await getMyProfile("https://auth.example.com");
        expect(fetchMock).toHaveBeenCalledWith(
            "https://auth.example.com/api/profiles/me",
            expect.objectContaining({ credentials: "include" }),
        );
        expect(result).toEqual(profile);
    });
});

describe("formatProfileName", () => {
    it("joins givenName and familyName", () => {
        expect(formatProfileName({ givenName: "Jane", familyName: "Doe" })).toBe("Jane Doe");
    });

    it("uses just givenName when familyName is absent", () => {
        expect(formatProfileName({ givenName: "Jane" })).toBe("Jane");
    });

    it("uses just familyName when givenName is absent", () => {
        expect(formatProfileName({ familyName: "Doe" })).toBe("Doe");
    });

    it("returns undefined when neither is set", () => {
        expect(formatProfileName({})).toBeUndefined();
    });

    it("returns undefined when the profile itself is undefined", () => {
        expect(formatProfileName(undefined)).toBeUndefined();
    });
});

describe("profileInitials", () => {
    it("combines the first letter of givenName and familyName", () => {
        expect(profileInitials({ givenName: "Jane", familyName: "Doe" }, "u1")).toBe("JD");
    });

    it("falls back to the uid's first letter when the profile has no name", () => {
        expect(profileInitials({}, "u1")).toBe("U");
    });

    it("falls back to the uid's first letter when the profile itself is undefined", () => {
        expect(profileInitials(undefined, "jane")).toBe("J");
    });

    it("falls back to '?' when there is no name and no uid", () => {
        expect(profileInitials(undefined, "")).toBe("?");
    });
});
