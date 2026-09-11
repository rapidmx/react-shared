///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Typed wrappers over `@rapidmx/restapi`'s `DistributionList` CRUD route (`BaseDistributionListRoute`) —
 * trusted-role-only, no self-service creation or per-list delegated ownership (v1).
 */

import { apiFetch } from "./api.js";
import { ListParams, buildQuery } from "./apiQuery.js";

export type { ListParams };

export interface DistributionList {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    primarySmtpAddress: string;
    aliasAddresses?: string[];
    name: string;
    description?: string;
    /** Informational only — v1 has no delegated-ownership enforcement; list management is trusted-role-only. */
    ownerUserUid?: string;
    memberAddresses: string[];
    restrictSenders?: boolean;
}

export function listDistributionLists(params: ListParams = {}): Promise<DistributionList[]> {
    return apiFetch(`/mail/distribution-lists?${buildQuery(params)}`);
}

export function getDistributionList(uid: string): Promise<DistributionList> {
    return apiFetch(`/mail/distribution-lists/${encodeURIComponent(uid)}`);
}

export interface CreateDistributionListInput {
    primarySmtpAddress: string;
    aliasAddresses?: string[];
    name: string;
    description?: string;
    ownerUserUid?: string;
    memberAddresses?: string[];
    restrictSenders?: boolean;
}

export function createDistributionList(input: CreateDistributionListInput): Promise<DistributionList> {
    return apiFetch("/mail/distribution-lists", {
        method: "POST",
        body: JSON.stringify({ aliasAddresses: [], memberAddresses: [], ...input }),
    });
}

export interface UpdateDistributionListInput {
    uid: string;
    version: number;
    name?: string;
    description?: string;
    aliasAddresses?: string[];
    memberAddresses?: string[];
    restrictSenders?: boolean;
}

export function updateDistributionList(input: UpdateDistributionListInput): Promise<DistributionList> {
    return apiFetch(`/mail/distribution-lists/${encodeURIComponent(input.uid)}`, {
        method: "PUT",
        body: JSON.stringify(input),
    });
}

export function deleteDistributionList(uid: string, version: number): Promise<void> {
    return apiFetch(`/mail/distribution-lists/${encodeURIComponent(uid)}?version=${version}`, { method: "DELETE" });
}
