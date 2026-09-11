///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Typed wrapper over `@rapidrest/auth`'s `BaseProfileRoute`, mounted by auth-server at `/api/profiles`. Used
 * for the signed-in user's own display name/avatar in the top-right user menu (see `UserMenu.tsx`) — this
 * service has no local user directory of its own (see `.claude/NOTES.md`), so name/avatar can only ever come
 * from auth-server.
 */
import { authApiFetch } from "./api.js";

export interface Profile {
    uid: string;
    /** URL to the user's avatar image (e.g. gravatar). Absent for most password-registered accounts. */
    avatar?: string;
    givenName?: string;
    familyName?: string;
}

/** Fetches the signed-in caller's own profile — `"me"` resolves to the caller's own uid server-side. */
export function getMyProfile(authServerUrl: string): Promise<Profile> {
    return authApiFetch(authServerUrl, "/profiles/me");
}

/** `"Jane Doe"`, `"Jane"`, `"Doe"`, or `undefined` if neither name field is set. */
export function formatProfileName(profile: Pick<Profile, "givenName" | "familyName"> | undefined): string | undefined {
    const name = [profile?.givenName, profile?.familyName].filter(Boolean).join(" ").trim();
    return name || undefined;
}

/** A 1-2 letter initials badge fallback, derived from the profile's name, or the given uid if it has none. */
export function profileInitials(profile: Pick<Profile, "givenName" | "familyName"> | undefined, uid: string): string {
    const initials = [profile?.givenName?.[0], profile?.familyName?.[0]].filter(Boolean).join("");
    return (initials || uid[0] || "?").toUpperCase();
}
