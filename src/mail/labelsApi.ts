///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Typed wrappers over `@rapidmx/restapi`'s `Label` CRUD route (`BaseScopedChildRoute`,
 * `scopeProperty: "mailboxUid"`) — mailbox-scoped, same pattern as `mailSignaturesApi.ts`. A label is
 * applied to a message by setting `Message.labelUids` directly (an ordinary field, not read-only - see
 * `mailApi.ts#setMessageLabels()`), the same way `MailFilterActionType.APPLY_LABEL` does it
 * automatically for inbound mail; there is no separate "assign" endpoint.
 */

import { apiFetch } from "../util/api.js";
import { ListParams, buildQuery } from "../util/apiQuery.js";

export type { ListParams };

export interface Label {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    mailboxUid: string;
    name: string;
    /** An optional hex-ish color hint (same loose convention as `Note.color`) - restapi doesn't
     * validate its shape. */
    color?: string;
}

export function listLabels(mailboxUid: string, params: ListParams = {}): Promise<Label[]> {
    return apiFetch(`/mail/labels?${buildQuery(params, { mailboxUid })}`);
}

export function getLabel(uid: string): Promise<Label> {
    return apiFetch(`/mail/labels/${encodeURIComponent(uid)}`);
}

export interface CreateLabelInput {
    mailboxUid: string;
    name: string;
    color?: string;
}

export function createLabel(input: CreateLabelInput): Promise<Label> {
    return apiFetch("/mail/labels", { method: "POST", body: JSON.stringify(input) });
}

export interface UpdateLabelInput {
    uid: string;
    version: number;
    name?: string;
    color?: string;
}

export function updateLabel(input: UpdateLabelInput): Promise<Label> {
    return apiFetch(`/mail/labels/${encodeURIComponent(input.uid)}`, { method: "PUT", body: JSON.stringify(input) });
}

/**
 * Deleting a label also strips its uid from every message's `labelUids` in this mailbox
 * (`BaseLabelRoute.cleanUpDeletedLabel()`, a synchronous full-mailbox scan server-side) - the client
 * has no separate cleanup step to perform, but a caller with an already-loaded message list should
 * still drop the deleted uid from any locally-cached `labelUids` itself, since this call doesn't return
 * the affected messages.
 */
export function deleteLabel(uid: string, version: number): Promise<void> {
    return apiFetch(`/mail/labels/${encodeURIComponent(uid)}?version=${version}`, { method: "DELETE" });
}
