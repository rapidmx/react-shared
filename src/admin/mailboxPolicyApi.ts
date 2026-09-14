///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Typed wrappers over `@rapidmx/restapi`'s deployment-wide `MailboxPolicy` singleton (`BaseMailboxPolicyRoute`,
 * mounted at `system/mailbox-policy`). `GET` is readable by any authenticated user and always returns the values in
 * effect (server config fills anything never saved); `PUT` is trusted-admin-only.
 */
import { apiFetch } from "../util/api.js";

/** Mirrors `@rapidmx/restapi`'s `PublicMailboxPolicy`. */
export interface MailboxPolicy {
    /** The quota a newly created mailbox starts with, in bytes. */
    defaultQuotaBytes: number;
    /** Whether a signed-in user without a mailbox may create their own on first sign-in. */
    autoProvisionEnabled: boolean;
    /** The quota of a mailbox a user creates for themselves, in bytes. */
    autoProvisionQuotaBytes: number;
}

export function getMailboxPolicy(): Promise<MailboxPolicy> {
    return apiFetch("/system/mailbox-policy");
}

/** Partial patch - only supplied fields change. */
export function updateMailboxPolicy(patch: Partial<MailboxPolicy>): Promise<MailboxPolicy> {
    return apiFetch("/system/mailbox-policy", { method: "PUT", body: JSON.stringify(patch) });
}
