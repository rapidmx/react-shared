///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Typed wrappers over `@rapidmx/restapi`'s deployment-wide `RetentionPolicy` singleton
 * (`BaseRetentionPolicyRoute`, mounted at `system/retention-policy`). `GET` is readable by any
 * authenticated user; `PUT` is trusted-admin-only server-side. Enforcement itself (actually purging
 * expired messages/audit-log entries) lives entirely in restapi's own `RetentionEnforcementJob` — this
 * file only reads/writes the configuration.
 */
import { apiFetch } from "../util/api.js";

/** Mirrors `@rapidmx/restapi`'s `PublicRetentionPolicy` exactly. Both fields `undefined` means "no
 * automatic purge configured" — `GET` returns `{}` rather than 404 when nothing has been set yet. */
export interface RetentionPolicy {
    /** Max age (days) for any `Message`, any folder. `undefined` = no automatic purge. */
    messageRetentionDays?: number;
    /** Max age (days) for `AuditLogEntry` rows. `undefined` = keep forever. Never applies to the
     * separate, hash-chained `EscrowAuditLogEntry` ledger — deleting from that would break its own
     * tamper-evident chain, by design. */
    auditLogRetentionDays?: number;
}

/** The server-enforced floor for `auditLogRetentionDays` (2190 days, ~6 years — a HIPAA-approximation
 * minimum) — mirrored here only so client-side validation can give the same message before a round trip;
 * the server enforces this regardless. */
export const MIN_AUDIT_LOG_RETENTION_DAYS = 2190;

export function getRetentionPolicy(): Promise<RetentionPolicy> {
    return apiFetch(`/system/retention-policy`);
}

/** Partial patch — only supplied fields are changed. There is no way to clear a previously-configured
 * field back to "no automatic purge" through this endpoint (matches the route's own real behavior,
 * not a client-side limitation to work around). */
export function updateRetentionPolicy(patch: Partial<RetentionPolicy>): Promise<RetentionPolicy> {
    return apiFetch(`/system/retention-policy`, {
        method: "PUT",
        body: JSON.stringify(patch),
    });
}
