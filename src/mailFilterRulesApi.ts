///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Typed wrappers over `@rapidmx/restapi`'s `MailFilterRule` CRUD route (`BaseScopedChildRoute`,
 * `scopeProperty: "mailboxUid"`) — mailbox-scoped (unlike `TransportRule`, which is trusted-role-only
 * and org-wide): every list/create call must carry `mailboxUid`, checked against that mailbox's own
 * ACL, same pattern as `Message`/`Task`/`Note`/`Contact`. Evaluated by `ScanQueueJob` immediately after
 * a message is verdicted "deliver" and before it's filed into the mailbox's Inbox — a live, enforced
 * feature, not a data-model-only stub.
 */

import { apiFetch } from "./api.js";
import { ListParams, buildQuery } from "./apiQuery.js";
import { MessageImportance } from "./mailApi.js";

export type { ListParams };

export type MailFilterActionType = "move_to_folder" | "copy_to_folder" | "delete" | "mark_as_read" | "forward";

export interface MailFilterAction {
    type: MailFilterActionType;
    /** Required for `move_to_folder`/`copy_to_folder`. */
    folderUid?: string;
    /** Required for `forward`. */
    forwardTo?: string;
}

export interface MailFilterConditions {
    fromContains?: string[];
    subjectContains?: string[];
    bodyContains?: string[];
    toCcContains?: string[];
    hasAttachment?: boolean;
    importance?: MessageImportance;
}

export interface MailFilterRule {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    mailboxUid: string;
    name: string;
    enabled: boolean;
    sequence: number;
    stopProcessingRules: boolean;
    conditions: MailFilterConditions;
    actions: MailFilterAction[];
}

export function listMailFilterRules(mailboxUid: string, params: ListParams = {}): Promise<MailFilterRule[]> {
    return apiFetch(`/mail/mail-filter-rules?${buildQuery(params, { mailboxUid })}`);
}

export function getMailFilterRule(uid: string): Promise<MailFilterRule> {
    return apiFetch(`/mail/mail-filter-rules/${encodeURIComponent(uid)}`);
}

export interface CreateMailFilterRuleInput {
    mailboxUid: string;
    name: string;
    enabled?: boolean;
    sequence?: number;
    stopProcessingRules?: boolean;
    conditions?: MailFilterConditions;
    actions?: MailFilterAction[];
}

export function createMailFilterRule(input: CreateMailFilterRuleInput): Promise<MailFilterRule> {
    return apiFetch("/mail/mail-filter-rules", {
        method: "POST",
        body: JSON.stringify({
            enabled: true,
            sequence: 0,
            stopProcessingRules: false,
            conditions: {},
            actions: [],
            ...input,
        }),
    });
}

export interface UpdateMailFilterRuleInput {
    uid: string;
    version: number;
    name?: string;
    enabled?: boolean;
    sequence?: number;
    stopProcessingRules?: boolean;
    conditions?: MailFilterConditions;
    actions?: MailFilterAction[];
}

export function updateMailFilterRule(input: UpdateMailFilterRuleInput): Promise<MailFilterRule> {
    return apiFetch(`/mail/mail-filter-rules/${encodeURIComponent(input.uid)}`, {
        method: "PUT",
        body: JSON.stringify(input),
    });
}

export function deleteMailFilterRule(uid: string, version: number): Promise<void> {
    return apiFetch(`/mail/mail-filter-rules/${encodeURIComponent(uid)}?version=${version}`, { method: "DELETE" });
}
