///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Typed wrappers over `@rapidmx/restapi`'s `TransportRule` CRUD route (`BaseTransportRuleRoute`) —
 * trusted-role-only, org-wide (evaluated once per SMTP transaction, before per-mailbox fan-out). No
 * uid-derivation on create (unlike `Domain`/`Mailbox`/`DistributionList`) — a transport rule has no
 * natural address of its own.
 */

import { apiFetch } from "./api.js";
import { ListParams, buildQuery } from "./apiQuery.js";

export type { ListParams };

export type TransportRuleActionType = "reject" | "quarantine" | "add_header" | "add_recipient";

export interface TransportRuleAction {
    type: TransportRuleActionType;
    /** Required for `add_header`. */
    headerName?: string;
    /** Required for `add_header`. */
    headerValue?: string;
    /** Required for `add_recipient`. */
    recipientAddress?: string;
}

export interface TransportRuleConditions {
    fromContains?: string[];
    subjectContains?: string[];
    bodyContains?: string[];
    recipientContains?: string[];
    anyRecipientExternal?: boolean;
    hasAttachment?: boolean;
    attachmentNameContains?: string[];
}

export interface TransportRule {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    name: string;
    enabled: boolean;
    sequence: number;
    stopProcessingRules: boolean;
    conditions: TransportRuleConditions;
    actions: TransportRuleAction[];
}

export function listTransportRules(params: ListParams = {}): Promise<TransportRule[]> {
    return apiFetch(`/mail/transport-rules?${buildQuery(params)}`);
}

export function getTransportRule(uid: string): Promise<TransportRule> {
    return apiFetch(`/mail/transport-rules/${encodeURIComponent(uid)}`);
}

export interface CreateTransportRuleInput {
    name: string;
    enabled?: boolean;
    sequence?: number;
    stopProcessingRules?: boolean;
    conditions?: TransportRuleConditions;
    actions?: TransportRuleAction[];
}

export function createTransportRule(input: CreateTransportRuleInput): Promise<TransportRule> {
    return apiFetch("/mail/transport-rules", {
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

export interface UpdateTransportRuleInput {
    uid: string;
    version: number;
    name?: string;
    enabled?: boolean;
    sequence?: number;
    stopProcessingRules?: boolean;
    conditions?: TransportRuleConditions;
    actions?: TransportRuleAction[];
}

export function updateTransportRule(input: UpdateTransportRuleInput): Promise<TransportRule> {
    return apiFetch(`/mail/transport-rules/${encodeURIComponent(input.uid)}`, {
        method: "PUT",
        body: JSON.stringify(input),
    });
}

export function deleteTransportRule(uid: string, version: number): Promise<void> {
    return apiFetch(`/mail/transport-rules/${encodeURIComponent(uid)}?version=${version}`, { method: "DELETE" });
}
