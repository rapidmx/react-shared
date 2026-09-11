///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Typed wrapper over `@rapidmx/restapi`'s `AuditLogEntry` route (`BaseAuditLogRoute`) — read-only: every
 * write path (`create`/`update`/`delete`/`truncate`) unconditionally 403s, trusted callers included, so
 * there is no write function here to mirror `domainsApi.ts`'s CRUD shape. The only writer is restapi's
 * own server-internal `recordAuditLog()`.
 */

import { apiFetch } from "./api.js";
import { ListParams, buildQuery } from "./apiQuery.js";

export type { ListParams };

export interface AuditLogEntry {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    mailboxUid?: string;
    actorUserUid?: string;
    action: string;
    targetType: string;
    targetUid: string;
    ip?: string;
    details?: Record<string, unknown>;
}

export interface AuditLogFilters {
    mailboxUid?: string;
    actorUserUid?: string;
    action?: string;
    targetType?: string;
}

export function listAuditLog(filters: AuditLogFilters = {}, params: ListParams = {}): Promise<AuditLogEntry[]> {
    const extra: Record<string, string> = {};
    if (filters.mailboxUid) extra.mailboxUid = filters.mailboxUid;
    if (filters.actorUserUid) extra.actorUserUid = filters.actorUserUid;
    if (filters.action) extra.action = filters.action;
    if (filters.targetType) extra.targetType = filters.targetType;
    return apiFetch(`/mail/audit-log?${buildQuery(params, extra)}`);
}
