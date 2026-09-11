///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Typed wrappers over `@rapidmx/restapi`'s `Domain` CRUD + verification routes (`BaseDomainRoute`).
 * Every route here is `@RequiresTrustedRole()` on the backend — admin-only, matching `mailApi.ts`'s other
 * admin-scoped entities.
 */

import { apiFetch } from "./api.js";
import { ListParams, buildQuery } from "./apiQuery.js";

export type { ListParams };

export interface Domain {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    name: string;
    enabled: boolean;
    verified: boolean;
    verificationToken: string;
    verifiedAt?: string;
    lastCheckedAt?: string;
    dkimSelector?: string;
    dkimPublicKey?: string;
    dmarcPolicy?: "none" | "quarantine" | "reject";
    dmarcReportEmail?: string;
}

export function listDomains(params: ListParams = {}): Promise<Domain[]> {
    return apiFetch(`/mail/domains?${buildQuery(params)}`);
}

export function getDomain(uid: string): Promise<Domain> {
    return apiFetch(`/mail/domains/${encodeURIComponent(uid)}`);
}

export interface CreateDomainInput {
    name: string;
    enabled?: boolean;
    dkimSelector?: string;
    dkimPublicKey?: string;
    dmarcPolicy?: "none" | "quarantine" | "reject";
    dmarcReportEmail?: string;
}

export function createDomain(input: CreateDomainInput): Promise<Domain> {
    return apiFetch("/mail/domains", {
        method: "POST",
        body: JSON.stringify({ enabled: true, ...input }),
    });
}

export interface UpdateDomainInput {
    uid: string;
    version: number;
    enabled?: boolean;
    dkimSelector?: string;
    dkimPublicKey?: string;
    dmarcPolicy?: "none" | "quarantine" | "reject";
    dmarcReportEmail?: string;
}

export function updateDomain(input: UpdateDomainInput): Promise<Domain> {
    return apiFetch(`/mail/domains/${encodeURIComponent(input.uid)}`, {
        method: "PUT",
        body: JSON.stringify(input),
    });
}

export function deleteDomain(uid: string, version: number): Promise<void> {
    return apiFetch(`/mail/domains/${encodeURIComponent(uid)}?version=${version}`, { method: "DELETE" });
}

/** Triggers an immediate DNS ownership check rather than waiting for the next scheduled background pass.
 * Idempotent on an already-verified domain; a still-unverified result is not an error (only
 * `lastCheckedAt` advances) — always returns the domain's current state either way. */
export function verifyDomain(uid: string): Promise<Domain> {
    return apiFetch(`/mail/domains/${encodeURIComponent(uid)}/verify`, { method: "POST" });
}

export type DnsRecordType = "ownership" | "mx" | "spf" | "dkim" | "dmarc";

/** One mail-related DNS record this server recommends for a domain, live-checked against real DNS —
 * purely diagnostic, never mutates anything (unlike `verifyDomain`). */
export interface DnsRecordCheck {
    type: DnsRecordType;
    recordKind: "TXT" | "MX";
    recordName: string;
    /** `false` when there isn't enough information yet to know what to recommend (no DKIM
     * selector/key configured, for example) — `recommendedValue`/`found`/`matches` are meaningless then. */
    configured: boolean;
    recommendedValue?: string;
    found: boolean;
    matches: boolean;
    actualValue?: string;
}

export function getDnsSetup(uid: string): Promise<DnsRecordCheck[]> {
    return apiFetch(`/mail/domains/${encodeURIComponent(uid)}/dns-setup`);
}
