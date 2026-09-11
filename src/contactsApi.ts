///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/** Typed wrappers over `@rapidmx/restapi`'s `/mail/contacts` REST surface — see `mailApi.ts`'s own header
 * comment for the shared ACL/authorization model every wrapper file here follows. */

import { apiFetch } from "./api.js";
import { ListParams, buildQuery } from "./apiQuery.js";

export type ContactAddressKind = "home" | "work" | "other";

export interface ContactEmail {
    address: string;
    type: ContactAddressKind;
}

export interface ContactPhone {
    phoneNumber: string;
    type: ContactAddressKind;
}

export interface ContactPostalAddress {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    type: ContactAddressKind;
}

export interface Contact {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    mailboxUid: string;
    folderUid: string;
    /** The `ContactList` (group) this contact belongs to, if any. */
    contactListUid?: string;
    displayName: string;
    givenName?: string;
    surname?: string;
    emails: ContactEmail[];
    phones: ContactPhone[];
    addresses: ContactPostalAddress[];
    company?: string;
    jobTitle?: string;
    notes?: string;
    photoBlobKey?: string;
    sourceUid?: string;
    /** Whether the caller has starred/favorited this contact. Absent is equivalent to `false`. */
    favorite?: boolean;
    /** Free-form category labels (Outlook-style colored categories) applied to this contact, if any. */
    categories?: string[];
    /** Present (and `true`) only when fetched via `listDeletedContacts()` — a soft-deleted `RecoverableBaseEntity`
     * record still exists server-side so it can be restored, per `@rapidmx/restapi`'s own soft-delete model. */
    deleted?: boolean;
}

/** Lists a folder's contacts, alphabetically by display name. Never includes soft-deleted contacts — see
 * `listDeletedContacts()` for those. */
export function listContacts(folderUid: string, params: ListParams = {}): Promise<Contact[]> {
    return apiFetch(`/mail/contacts?${buildQuery(params, { folderUid, sort: JSON.stringify({ displayName: "ASC" }) })}`);
}

/**
 * Lists a folder's soft-deleted contacts (for an Outlook-style "Deleted" view) — `deleted` is an ordinary
 * queryable field on `Contact` (a `RecoverableBaseEntity`), so this is the same `find()` the plain listing
 * above uses, just constrained to `deleted: true` instead of the framework's own default of excluding them.
 *
 * Read-only for now — deliberately no `restoreContact()`: `@rapidmx/restapi`'s generic
 * `BaseScopedChildRoute.update()` looks the target record up via a plain `findOne()` with no
 * `includeDeleted` option, so it 404s on an already-deleted record before ever reaching the point where
 * setting `deleted: false` would matter. Restoring would need a real fix in `@rapidmx/restapi` itself
 * (passing `includeDeleted: true` into that lookup) — out of scope for this pass; the "Deleted" view here
 * is browse-only until that lands.
 */
export function listDeletedContacts(folderUid: string, params: ListParams = {}): Promise<Contact[]> {
    return apiFetch(
        `/mail/contacts?${buildQuery(params, { folderUid, deleted: "true", sort: JSON.stringify({ displayName: "ASC" }) })}`,
    );
}

export function getContact(uid: string): Promise<Contact> {
    return apiFetch(`/mail/contacts/${encodeURIComponent(uid)}`);
}

export interface ContactInput {
    mailboxUid: string;
    folderUid: string;
    contactListUid?: string;
    displayName: string;
    givenName?: string;
    surname?: string;
    emails?: ContactEmail[];
    phones?: ContactPhone[];
    addresses?: ContactPostalAddress[];
    company?: string;
    jobTitle?: string;
    notes?: string;
    favorite?: boolean;
    categories?: string[];
}

export function createContact(input: ContactInput): Promise<Contact> {
    return apiFetch("/mail/contacts", {
        method: "POST",
        body: JSON.stringify({ emails: [], phones: [], addresses: [], ...input }),
    });
}

export interface UpdateContactInput extends ContactInput {
    uid: string;
    version: number;
}

export function updateContact(input: UpdateContactInput): Promise<Contact> {
    return apiFetch(`/mail/contacts/${encodeURIComponent(input.uid)}`, {
        method: "PUT",
        body: JSON.stringify(input),
    });
}

/** Thin `updateContact()` wrapper for toggling favorite/star status — same pattern as `mailApi.ts`'s
 * `setMessageRead()`/`tasksApi.ts`'s `setTaskCompleted()`. */
export function setContactFavorite(contact: Contact, favorite: boolean): Promise<Contact> {
    return updateContact({ ...contact, favorite });
}

export function deleteContact(uid: string, version: number): Promise<void> {
    return apiFetch(`/mail/contacts/${encodeURIComponent(uid)}?version=${version}`, { method: "DELETE" });
}

export interface ContactList {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    mailboxUid: string;
    name: string;
}

/** Lists a mailbox's contact lists (Outlook-style "Your contact lists"), alphabetically by name. */
export function listContactLists(mailboxUid: string, params: ListParams = {}): Promise<ContactList[]> {
    return apiFetch(`/mail/contact-lists?${buildQuery(params, { mailboxUid, sort: JSON.stringify({ name: "ASC" }) })}`);
}

export function createContactList(input: { mailboxUid: string; name: string }): Promise<ContactList> {
    return apiFetch("/mail/contact-lists", { method: "POST", body: JSON.stringify(input) });
}

export function updateContactList(input: { uid: string; version: number; name: string }): Promise<ContactList> {
    return apiFetch(`/mail/contact-lists/${encodeURIComponent(input.uid)}`, {
        method: "PUT",
        body: JSON.stringify(input),
    });
}

export function deleteContactList(uid: string, version: number): Promise<void> {
    return apiFetch(`/mail/contact-lists/${encodeURIComponent(uid)}?version=${version}`, { method: "DELETE" });
}
