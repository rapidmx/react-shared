///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Typed wrappers over `@rapidmx/restapi`'s `FocusedInboxOverride` CRUD route (`BaseScopedChildRoute`,
 * `scopeProperty: "mailboxUid"`) — the standing "always classify mail from this sender as Focused/Other"
 * rules `BaseMessageRoute.classify()` (see `classifyMessage()` in `mailApi.ts`) upserts when a caller sets
 * `applyToSender: true`. This file lets a Settings page list/remove those rules directly, and add one by
 * hand without first receiving a matching message.
 */

import { apiFetch } from "./api.js";
import { ListParams, buildQuery } from "./apiQuery.js";
import { MessageClassification } from "./mailApi.js";

export type { ListParams };

export interface FocusedInboxOverride {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    mailboxUid: string;
    senderAddress: string;
    classifyAs: MessageClassification;
}

export function listFocusedInboxOverrides(mailboxUid: string, params: ListParams = {}): Promise<FocusedInboxOverride[]> {
    return apiFetch(`/mail/focused-inbox-overrides?${buildQuery(params, { mailboxUid })}`);
}

export interface CreateFocusedInboxOverrideInput {
    mailboxUid: string;
    senderAddress: string;
    classifyAs: MessageClassification;
}

export function createFocusedInboxOverride(input: CreateFocusedInboxOverrideInput): Promise<FocusedInboxOverride> {
    return apiFetch("/mail/focused-inbox-overrides", {
        method: "POST",
        body: JSON.stringify(input),
    });
}

export interface UpdateFocusedInboxOverrideInput {
    uid: string;
    version: number;
    classifyAs: MessageClassification;
}

export function updateFocusedInboxOverride(input: UpdateFocusedInboxOverrideInput): Promise<FocusedInboxOverride> {
    return apiFetch(`/mail/focused-inbox-overrides/${encodeURIComponent(input.uid)}`, {
        method: "PUT",
        body: JSON.stringify(input),
    });
}

export function deleteFocusedInboxOverride(uid: string, version: number): Promise<void> {
    return apiFetch(`/mail/focused-inbox-overrides/${encodeURIComponent(uid)}?version=${version}`, { method: "DELETE" });
}
