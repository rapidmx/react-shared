///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Typed wrappers over `@rapidmx/restapi`'s `BaseMailboxAccessRoute` (`GET/PUT/DELETE /mail/mailboxes/:id/
 * access[/:userOrRoleId]`, `GET /mail/mailboxes/lookup-by-email`) - a friendlier, purpose-built layer over
 * mailbox delegate access than this package's own `getMailboxAcl()`/`grantMailboxAccess()`/
 * `revokeMailboxAccess()` (`mailApi.ts`), which stay as-is for their one existing caller (the admin-only
 * `ShareAccessCard`). Those wrap the fully generic `BaseACLRoute` directly (raw `ACLRecord.actions[]`,
 * requires the caller hold literal `ACLAction.FULL`); this module's routes are gated at plain `"update"`
 * and speak a simple 2-tier `"viewer"`/`"manager"` vocabulary instead, so a non-admin mailbox owner or
 * delegate can use them too.
 */
import { apiFetch } from "../util/api.js";

/** A role that can be granted. */
export type MailboxAccessRole = "viewer" | "manager";

/** A member's role as listed: `"custom"` for any other set of actions granted outside this API, which can't be set
 * here - see `actions` for what it allows. */
export type MailboxAccessMemberRole = MailboxAccessRole | "custom";

export interface MailboxAccessMember {
    userOrRoleId: string;
    role: MailboxAccessMemberRole;
    /** The ACL actions the member holds. */
    actions?: string[];
}

export interface MailboxOwnerLookup {
    userUid: string;
    displayName: string;
}

/** Lists a mailbox's delegate members (excludes the owner's own implicit grant) - rejects with a 403
 * `ApiRequestError` if the caller doesn't hold at least `"update"` on the mailbox. */
export function listMailboxAccess(mailboxUid: string): Promise<MailboxAccessMember[]> {
    return apiFetch(`/mail/mailboxes/${encodeURIComponent(mailboxUid)}/access`);
}

/** Grants (or, if already a member, updates the role of) a delegate's access to a mailbox. */
export function setMailboxAccess(mailboxUid: string, userOrRoleId: string, role: MailboxAccessRole): Promise<MailboxAccessMember> {
    return apiFetch(`/mail/mailboxes/${encodeURIComponent(mailboxUid)}/access/${encodeURIComponent(userOrRoleId)}`, {
        method: "PUT",
        body: JSON.stringify({ role }),
    });
}

/** Revokes a delegate's access to a mailbox - never rejects for a `userOrRoleId` that wasn't a member. */
export function removeMailboxAccess(mailboxUid: string, userOrRoleId: string): Promise<void> {
    return apiFetch(`/mail/mailboxes/${encodeURIComponent(mailboxUid)}/access/${encodeURIComponent(userOrRoleId)}`, { method: "DELETE" });
}

/**
 * Resolves an email address to the person who owns the mailbox at that address, for a "share this
 * mailbox with someone" UI to grant access by uid after the caller types an email - there is no separate
 * user/identity directory anywhere in this platform (see `BaseMailboxAccessRoute`'s own doc comment), so
 * this only ever matches an existing `Mailbox`'s own address. Resolves to `null` (not a thrown error) for
 * an address with no matching mailbox, or one that only matches a shared (ownerless) mailbox - both are
 * "no person found," a normal, expected outcome, not a failure.
 */
export function lookupMailboxOwnerByEmail(email: string): Promise<MailboxOwnerLookup | null> {
    return apiFetch(`/mail/mailboxes/lookup-by-email?email=${encodeURIComponent(email)}`);
}
