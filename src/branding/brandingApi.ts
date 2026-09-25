///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Typed wrapper over `@rapidmx/restapi`'s `Branding` route (`BaseBrandingRoute`) — a single, admin-managed,
 * publicly-readable row of product chrome (logo, title/company name, custom stylesheet, header/footer HTML).
 * `GET /system/branding` needs no auth (every viewer, including an anonymous booking-page visitor, can read
 * it); every write is `@RequiresTrustedRole()` on the backend.
 */

import { apiFetch, ApiRequestError, apiUrl, withCsrfHeader } from "../util/api.js";

export interface Branding {
    companyName: string;
    title: string;
    /** Already a directly-usable `<img src>` value — either an admin-set external URL, or (once uploaded via
     * `uploadBrandingLogo()`) this server's own resolved asset URL. Never a bare blob key. */
    logoUrl?: string;
    /** The compact mark for navigation headers, independently configurable from `logoUrl`'s full logo -
     * same directly-usable shape as `logoUrl`. Falls back to `logoUrl`, then a built-in default, when unset
     * (see `useBranding()`'s `iconSrc`) - no fallback is applied here. */
    iconUrl?: string;
    /** Same shape as `logoUrl`, directly usable as a `<link href>`. */
    stylesheetUrl?: string;
    headerHtml?: string;
    footerHtml?: string;
}

export function getBranding(): Promise<Branding> {
    return apiFetch("/system/branding");
}

export interface UpdateBrandingInput {
    companyName?: string;
    title?: string;
    logoUrl?: string;
    iconUrl?: string;
    stylesheetUrl?: string;
    headerHtml?: string;
    footerHtml?: string;
}

export function updateBranding(input: UpdateBrandingInput): Promise<Branding> {
    return apiFetch("/system/branding", {
        method: "PUT",
        body: JSON.stringify(input),
    });
}

async function uploadBrandingAsset(path: string, file: File): Promise<Branding> {
    const res = await fetch(apiUrl(path), {
        method: "POST",
        credentials: "include",
        headers: withCsrfHeader({ "Content-Type": file.type || "application/octet-stream" }),
        body: file,
    });
    const contentType = res.headers.get("content-type") ?? "";
    const responseBody = contentType.includes("application/json") ? await res.json().catch(() => undefined) : undefined;
    if (!res.ok) {
        const message = (responseBody && (responseBody.message || responseBody.error)) || res.statusText || "Upload failed.";
        throw new ApiRequestError(message, res.status, responseBody?.code);
    }
    return responseBody as Branding;
}

/** Uploads `file` as the logo, self-hosted via `BlobStore` — bypasses `apiFetch` (which always forces
 * `Content-Type: application/json`) the same way `mailApi.ts`'s `uploadAttachment()` does, since
 * `BaseBrandingRoute.uploadLogo()` reads the raw request body directly. */
export function uploadBrandingLogo(file: File): Promise<Branding> {
    return uploadBrandingAsset("/system/branding/logo", file);
}

/** Uploads `file` as the compact nav-header icon, independently of `uploadBrandingLogo()`'s full logo. */
export function uploadBrandingIcon(file: File): Promise<Branding> {
    return uploadBrandingAsset("/system/branding/icon", file);
}

export function uploadBrandingStylesheet(file: File): Promise<Branding> {
    return uploadBrandingAsset("/system/branding/stylesheet", file);
}

export function deleteBrandingLogo(): Promise<void> {
    return apiFetch("/system/branding/logo", { method: "DELETE" });
}

export function deleteBrandingIcon(): Promise<void> {
    return apiFetch("/system/branding/icon", { method: "DELETE" });
}

export function deleteBrandingStylesheet(): Promise<void> {
    return apiFetch("/system/branding/stylesheet", { method: "DELETE" });
}
