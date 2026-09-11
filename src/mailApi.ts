///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Typed wrappers over `@rapidmx/restapi`'s REST surface. Shared by `apps/admin` and (from Phase 3 on)
 * `apps/www` — there is no separate admin-only endpoint set to isolate: every route here is gated entirely
 * by the ACL system, so the exact same call returns a caller's own data or (for a trusted/admin caller)
 * everyone's, depending on who's asking. See `BaseMailboxRoute`'s doc comment in `@rapidmx/restapi` and this
 * repo's `.claude/NOTES.md`.
 */

import { ApiRequestError, apiFetch, authApiFetch } from "./api.js";
import { ListParams, buildQuery } from "./apiQuery.js";

export type { ListParams };

export interface Mailbox {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    /** Absent for a true ownerless shared mailbox (e.g. `support@example.com`) — access is ACL-only. */
    ownerUserUid?: string;
    primarySmtpAddress: string;
    aliasAddresses: string[];
    displayName: string;
    timezone: string;
    quotaBytes: number;
    usedBytes: number;
    /** `true` for a bookable resource (Exchange's "room"/"equipment" mailbox concept) rather than a
     * person — trusted-role-only to create, same gate as any other ownerless mailbox. */
    isResource?: boolean;
    /** Only meaningful when `isResource` is `true`. */
    resourceType?: "room" | "equipment";
    /** Informational only — not used by any accept/decline logic. */
    resourceCapacity?: number;
    /** Mirrors Exchange's `AutomateProcessing AutoAccept` — off by default. Has no effect unless
     * `isResource` is also `true`. */
    autoAcceptBookings?: boolean;
    /** When set, every request is auto-accepted regardless of existing bookings. */
    allowConflicts?: boolean;
    /** A request starting further out than this many days is auto-declined. `undefined` means no limit. */
    bookingWindowDays?: number;
    /** A request longer than this many minutes is auto-declined. `undefined` means no limit. */
    maxDurationMinutes?: number;
    /** `true` if this mailbox's out-of-office auto-reply is currently enabled. Always present on a real
     * `Mailbox` (defaults to `false` server-side) — optional here only because some older test fixtures
     * predate this field, matching this file's existing convention for every other boolean flag above. */
    oofEnabled?: boolean;
    /** The out-of-office auto-reply message body — a single combined message rather than per-audience
     * variants, matching `@rapidmx/restapi`'s own deliberate simplification. Always present (defaults to
     * `""`), same caveat as `oofEnabled` above. */
    oofMessage?: string;
    /** When set together with `oofEndTime`, the auto-reply is only active within this window rather than
     * indefinitely while `oofEnabled` is `true`. */
    oofStartTime?: string;
    oofEndTime?: string;
    /** Whether `send()` attaches a real RFC 3798 receipt request to every outgoing message by default, for
     * internal vs. external recipients respectively — a per-draft `Message.requestReceipt` (see
     * `setMessageRequestReceipt()`) always overrides both at once when explicitly set. Always present on a
     * real `Mailbox` (defaults `true`/`false` server-side respectively), same optional-for-old-fixtures
     * caveat as `oofEnabled`. */
    alwaysRequestReceiptInternal?: boolean;
    alwaysRequestReceiptExternal?: boolean;
    /** Whether this mailbox, as the *recipient* of a receipt request, sends one back immediately versus
     * holding it for the owner's explicit approval (`approveReceipt()`/`declineReceipt()`) — classifies the
     * requester, not the recipient. Always present (defaults `true`/`false` respectively), same caveat. */
    autoSendReceiptsInternal?: boolean;
    autoSendReceiptsExternal?: boolean;
}

/** Lists mailboxes the caller can access (owned, shared with them, or — for a trusted caller — every one). */
export function listMailboxes(params: ListParams = {}): Promise<Mailbox[]> {
    return apiFetch(`/mail/mailboxes?${buildQuery(params)}`);
}

export function getMailbox(uid: string): Promise<Mailbox> {
    return apiFetch(`/mail/mailboxes/${encodeURIComponent(uid)}`);
}

/** Lists bookable resource mailboxes (rooms/equipment) visible to the caller — same ACL scoping as
 * `listMailboxes()`, just pre-filtered server-side to `isResource: true` so `ResourcePicker` doesn't
 * need to fetch and filter the caller's entire mailbox list client-side. */
export function listResourceMailboxes(params: ListParams = {}): Promise<Mailbox[]> {
    return apiFetch(`/mail/mailboxes?${buildQuery(params, { isResource: "true" })}`);
}

export interface CreateMailboxInput {
    /** Omit entirely to create a true ownerless shared mailbox — trusted-role-only (see BaseMailboxRoute). */
    ownerUserUid?: string;
    primarySmtpAddress: string;
    aliasAddresses?: string[];
    displayName: string;
    timezone: string;
    quotaBytes: number;
    isResource?: boolean;
    resourceType?: "room" | "equipment";
    resourceCapacity?: number;
    autoAcceptBookings?: boolean;
    allowConflicts?: boolean;
    bookingWindowDays?: number;
    maxDurationMinutes?: number;
}

export function createMailbox(input: CreateMailboxInput): Promise<Mailbox> {
    return apiFetch("/mail/mailboxes", {
        method: "POST",
        body: JSON.stringify({ aliasAddresses: [], usedBytes: 0, ...input }),
    });
}

/** This server's configured domain list (`mail:domains`) — empty when unconfigured, meaning no
 * restriction applies and a `primarySmtpAddress` may be on any domain. */
export function listMailboxDomains(): Promise<string[]> {
    return apiFetch("/mail/mailboxes/domains");
}

/** One (name alias, domain) combination the caller could register as their mailbox address. */
export interface MailboxAutoProvisionAliasOption {
    alias: string;
    domain: string;
    primarySmtpAddress: string;
}

export type MailboxAutoProvisionResult =
    | { status: "created"; mailbox: Mailbox }
    | { status: "existing"; mailbox: Mailbox }
    | { status: "needs_selection"; options: MailboxAutoProvisionAliasOption[] };

/**
 * Self-service mailbox creation for a user with none yet — see `BaseMailboxRoute.autoProvision()`'s own
 * doc comment in `@rapidmx/restapi` for the full contract. Call with no `selection` first; if the
 * result is `needs_selection`, call again with the option the user picked from that list.
 */
export function autoProvisionMailbox(selection?: { alias: string; domain: string }): Promise<MailboxAutoProvisionResult> {
    return apiFetch("/mail/mailboxes/auto-provision", {
        method: "POST",
        body: JSON.stringify(selection ?? {}),
    });
}

export interface UpdateMailboxInput {
    uid: string;
    version: number;
    displayName?: string;
    timezone?: string;
    quotaBytes?: number;
    aliasAddresses?: string[];
    isResource?: boolean;
    resourceType?: "room" | "equipment";
    resourceCapacity?: number;
    autoAcceptBookings?: boolean;
    allowConflicts?: boolean;
    bookingWindowDays?: number;
    maxDurationMinutes?: number;
    oofEnabled?: boolean;
    oofMessage?: string;
    oofStartTime?: string;
    oofEndTime?: string;
    alwaysRequestReceiptInternal?: boolean;
    alwaysRequestReceiptExternal?: boolean;
    autoSendReceiptsInternal?: boolean;
    autoSendReceiptsExternal?: boolean;
}

export function updateMailbox(input: UpdateMailboxInput): Promise<Mailbox> {
    return apiFetch(`/mail/mailboxes/${encodeURIComponent(input.uid)}`, {
        method: "PUT",
        body: JSON.stringify(input),
    });
}

export function deleteMailbox(uid: string, version: number): Promise<void> {
    return apiFetch(`/mail/mailboxes/${encodeURIComponent(uid)}?version=${version}`, { method: "DELETE" });
}

export type QuarantineReason = "infected" | "spam_policy" | "other";

export interface QuarantineEntry {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    mailboxUid: string;
    originalMessageUid?: string;
    reason: QuarantineReason;
    scanResultUid: string;
    rawBlobKey: string;
    releasedAt?: string;
    releasedByUserUid?: string;
}

/** Lists quarantined mail for a mailbox the caller can access — their own, or (trusted) any mailbox. */
export function listQuarantine(mailboxUid: string, params: ListParams = {}): Promise<QuarantineEntry[]> {
    return apiFetch(`/mail/quarantine?${buildQuery(params, { mailboxUid })}`);
}

/**
 * Marks a quarantined entry released. This only updates the record's metadata — it does not re-inject the
 * message into normal delivery (see `@rapidmx/restapi`'s NOTES.md for why that's an explicit non-goal here).
 */
export function releaseQuarantineEntry(uid: string, version: number, releasedByUserUid: string): Promise<QuarantineEntry> {
    return apiFetch(`/mail/quarantine/${encodeURIComponent(uid)}`, {
        method: "PUT",
        body: JSON.stringify({ uid, version, releasedAt: new Date().toISOString(), releasedByUserUid }),
    });
}

export type IngestStatus = "pending" | "scanning" | "delivered" | "failed";

export interface IngestQueueEntry {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    mailboxUid: string;
    envelopeFrom: string;
    envelopeTo: string[];
    rawBlobKey: string;
    status: IngestStatus;
    errorMessage?: string;
}

/** Lists ingest-queue entries for a mailbox the caller can access — useful for diagnosing stuck delivery. */
export function listIngestQueue(mailboxUid: string, params: ListParams = {}): Promise<IngestQueueEntry[]> {
    return apiFetch(`/mail/ingest-queue?${buildQuery(params, { mailboxUid })}`);
}

export interface AclRecord {
    userOrRoleId: string;
    actions: string[];
}

export interface AccessControlList {
    uid: string;
    version: number;
    parentUid?: string;
    records: AclRecord[];
}

/** Fetches a mailbox's own ACL — its `records` are its owner's/delegates' grants (see BaseACLRoute). */
export function getMailboxAcl(mailboxUid: string): Promise<AccessControlList> {
    return apiFetch(`/acls/${encodeURIComponent(mailboxUid)}`);
}

/**
 * Grants (or replaces, if `userOrRoleId` already has a record) a delegate's access to a mailbox — the
 * mechanism behind Exchange-style shared mailboxes. Read-modify-write against the ACL's own optimistic
 * `version`, so concurrent grants can conflict; the caller should retry on a 409/version-mismatch.
 */
export async function grantMailboxAccess(mailboxUid: string, userOrRoleId: string, actions: string[]): Promise<AccessControlList> {
    const acl = await getMailboxAcl(mailboxUid);
    const records = acl.records.filter((r) => r.userOrRoleId !== userOrRoleId);
    records.push({ userOrRoleId, actions });
    return apiFetch(`/acls/${encodeURIComponent(mailboxUid)}`, {
        method: "PUT",
        body: JSON.stringify({ uid: mailboxUid, version: acl.version, records }),
    });
}

/** Revokes a delegate's access to a mailbox previously granted via `grantMailboxAccess`. */
export async function revokeMailboxAccess(mailboxUid: string, userOrRoleId: string): Promise<AccessControlList> {
    const acl = await getMailboxAcl(mailboxUid);
    const records = acl.records.filter((r) => r.userOrRoleId !== userOrRoleId);
    return apiFetch(`/acls/${encodeURIComponent(mailboxUid)}`, {
        method: "PUT",
        body: JSON.stringify({ uid: mailboxUid, version: acl.version, records }),
    });
}

export type FolderType =
    | "inbox"
    | "sent_items"
    | "drafts"
    | "deleted_items"
    | "outbox"
    | "junk"
    | "calendar"
    | "contacts"
    | "tasks"
    | "notes"
    | "user";

export interface Folder {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    mailboxUid: string;
    name: string;
    type: FolderType;
    parentFolderUid?: string;
    unreadCount: number;
    totalCount: number;
    /** Display color for a `calendar`-type folder (a hex string or palette key) — unused by every other
     * folder type. Absent on a mailbox's original auto-provisioned calendar; see `calendarColors.ts`'s
     * `colorForFolder` for the fallback every caller should use instead of reading this field directly. */
    color?: string;
}

/** Lists a mailbox's folders — visible to its owner, any delegate the mailbox is shared with, or (trusted) anyone. */
export function listFolders(mailboxUid: string): Promise<Folder[]> {
    return apiFetch(`/mail/folders?${buildQuery({ limit: 200 }, { mailboxUid })}`);
}

export interface CreateFolderInput {
    mailboxUid: string;
    name: string;
    type: FolderType;
    parentFolderUid?: string;
    color?: string;
}

/** Creates a new folder — e.g. an additional `calendar`-type folder for multi-calendar support. Nothing
 * about folder creation is type-restricted server-side (see the Phase 4 plan's own note on
 * `BaseFolderRoute.create()`), so this is just a thin wrapper, not a new backend capability. */
export function createFolder(input: CreateFolderInput): Promise<Folder> {
    return apiFetch("/mail/folders", {
        method: "POST",
        body: JSON.stringify({ unreadCount: 0, totalCount: 0, ...input }),
    });
}

export interface UpdateFolderInput {
    uid: string;
    version: number;
    name?: string;
    color?: string;
}

export function updateFolder(input: UpdateFolderInput): Promise<Folder> {
    return apiFetch(`/mail/folders/${encodeURIComponent(input.uid)}`, {
        method: "PUT",
        body: JSON.stringify(input),
    });
}

export type RecipientType = "to" | "cc" | "bcc";

export interface Recipient {
    address: string;
    displayName?: string;
    type: RecipientType;
}

export interface MessageFlags {
    read: boolean;
    flagged: boolean;
    answered: boolean;
    forwarded: boolean;
}

export type MessageImportance = "low" | "normal" | "high";

/** Mirrors `@rapidmx/restapi`'s `MessageClassification` enum values exactly (`classify()`'s `classifyAs`
 * body field only accepts these two literal strings). */
export type MessageClassification = "focused" | "other";

export interface Message {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    folderUid: string;
    mailboxUid: string;
    messageId: string;
    subject: string;
    from: Recipient;
    recipients: Recipient[];
    sentDate: string;
    receivedDate: string;
    bodyPreview: string;
    flags: MessageFlags;
    importance: MessageImportance;
    hasAttachments: boolean;
    /** Set once `recallMessage()` has been called on this message — a recall is asynchronous and
     * best-effort (see that function's own doc comment), so this is the only signal a caller gets;
     * there is no separate "recalled successfully"/"failed" outcome synced onto the record itself. */
    recallRequestedAt?: string;
    /** When set to a future time, `sendMessage()` defers relay until then instead of sending
     * immediately — mirrors Outlook's "Do not deliver before". The message sits in the mailbox's
     * `outbox` folder (lazily created on the first scheduled send — never eagerly provisioned the way
     * Drafts/Sent Items are) until `@rapidmx/restapi`'s own `ScheduledSendJob` relays it and clears
     * this field. */
    scheduledSendTime?: string;
    /** Absent means Focused — see `classifyMessage()` and `@rapidmx/restapi`'s own
     * `FocusedInboxUtils.classifyMessage()` doc comment for the full precedence rule this reflects. */
    inferenceClassification?: MessageClassification;
    /** Set on a draft before `sendMessage()` to request a receipt, overriding the mailbox's own
     * `alwaysRequestReceiptInternal`/`External` defaults — see `setMessageRequestReceipt()`. Meaningless
     * once the message has actually been sent. */
    requestReceipt?: boolean;
    /** `true` when a delivery/read receipt was requested but this (recipient) mailbox's
     * `autoSendReceiptsInternal`/`External` setting held it for the owner's explicit approval instead of
     * sending it immediately — see `approveReceipt()`/`declineReceipt()`. Always present on a real
     * delivered `Message` (defaults `false`), same optional-for-old-fixtures caveat as `Mailbox.oofEnabled`. */
    deliveryReceiptPending?: boolean;
    readReceiptPending?: boolean;
    /** The per-recipient delivery/read roster on a *sent* message — the client-visible tracking indicator.
     * `undefined` (not an empty array) when no receipt was ever requested for this message. */
    receiptStatus?: MessageReceiptEntry[];
}

export interface MessageReceiptEntry {
    recipientAddress: string;
    deliveredAt?: string;
    readAt?: string;
}

/** Lists messages in a folder, newest first. */
export function listMessages(folderUid: string, params: ListParams = {}): Promise<Message[]> {
    return apiFetch(
        `/mail/messages?${buildQuery(params, { folderUid, sort: JSON.stringify({ receivedDate: "DESC" }) })}`,
    );
}

export function getMessage(uid: string): Promise<Message> {
    return apiFetch(`/mail/messages/${encodeURIComponent(uid)}`);
}

/**
 * Attempts to recall a message this mailbox previously sent — only valid for a message currently in
 * Sent Items (enforced server-side). Asynchronous and best-effort: this composes and relays a control
 * message to every original recipient, but the actual delete-if-still-unread mutation happens later on
 * each recipient's own mail system — there is no synchronous "recalled" outcome to report back, and the
 * only visible effect here is `recallRequestedAt` getting set on the response.
 */
export function recallMessage(uid: string): Promise<Message> {
    return apiFetch(`/mail/messages/${encodeURIComponent(uid)}/recall`, { method: "POST" });
}

/**
 * Moves a message between the Focused and Other halves of the Inbox — Outlook's "Move to Other" gesture.
 * With `applyToSender: true` ("Always move to Other"), also upserts a standing `FocusedInboxOverride` for
 * every future message from the same sender (see `focusedInboxOverridesApi.ts`) in the same round trip.
 */
export function classifyMessage(uid: string, classifyAs: MessageClassification, applyToSender = false): Promise<Message> {
    return apiFetch(`/mail/messages/${encodeURIComponent(uid)}/classify`, {
        method: "POST",
        body: JSON.stringify({ classifyAs, applyToSender }),
    });
}

/**
 * Marks a message read/unread in place. `folderUid` must be included even though it isn't changing — every
 * `Message` update is scoped by its owning folder (see `BaseScopedChildRoute`), and this framework's `PUT`
 * routes replace the whole record rather than patch individual fields.
 */
export function setMessageRead(message: Message, read: boolean): Promise<Message> {
    return apiFetch(`/mail/messages/${encodeURIComponent(message.uid)}`, {
        method: "PUT",
        body: JSON.stringify({ uid: message.uid, version: message.version, flags: { ...message.flags, read } }),
    });
}

/**
 * Sets a draft's `scheduledSendTime` ahead of calling `sendMessage()` — `send()` itself is what actually
 * checks the field and defers relay (moving the message into Outbox) instead of sending immediately,
 * per `@rapidmx/restapi`'s own `BaseMessageRoute.send()`; this is an ordinary `PUT`, no dedicated
 * "schedule" endpoint exists.
 */
export function setMessageScheduledSendTime(message: Message, scheduledSendTime: string): Promise<Message> {
    return apiFetch(`/mail/messages/${encodeURIComponent(message.uid)}`, {
        method: "PUT",
        body: JSON.stringify({ uid: message.uid, version: message.version, scheduledSendTime }),
    });
}

/**
 * Cancels a scheduled send — clears `scheduledSendTime` and moves the message back into `folderUid`
 * (the mailbox's Drafts folder) in the same `PUT`. Clearing the field alone does not revert the earlier
 * move into Outbox — that only ever happened as a side effect of `send()`'s own deferred branch, never
 * automatically undone (confirmed directly in restapi's own source, not assumed) — so the caller must
 * resolve the Drafts folder uid itself and include it here. `scheduledSendTime` is sent as `null`, not
 * omitted: this framework's `PUT` merges only the fields present in the body, so an absent field would
 * leave the old value in place instead of clearing it.
 */
export function cancelScheduledSend(message: Message, draftsFolderUid: string): Promise<Message> {
    return apiFetch(`/mail/messages/${encodeURIComponent(message.uid)}`, {
        method: "PUT",
        body: JSON.stringify({ uid: message.uid, version: message.version, scheduledSendTime: null, folderUid: draftsFolderUid }),
    });
}

/**
 * Sets a draft's `requestReceipt` ahead of calling `sendMessage()`, overriding the mailbox's own
 * `alwaysRequestReceiptInternal`/`External` defaults for this one message — same ordinary-`PUT`-before-
 * `send()` convention as `setMessageScheduledSendTime()`.
 */
export function setMessageRequestReceipt(message: Message, requestReceipt: boolean): Promise<Message> {
    return apiFetch(`/mail/messages/${encodeURIComponent(message.uid)}`, {
        method: "PUT",
        body: JSON.stringify({ uid: message.uid, version: message.version, requestReceipt }),
    });
}

export type ReceiptType = "delivery" | "read";

/** Sends a delivery/read receipt this mailbox held pending the owner's explicit approval (see
 * `Message.deliveryReceiptPending`/`readReceiptPending`). */
export function approveReceipt(uid: string, type: ReceiptType): Promise<Message> {
    return apiFetch(`/mail/messages/${encodeURIComponent(uid)}/receipt/approve`, {
        method: "POST",
        body: JSON.stringify({ type }),
    });
}

/** Permanently declines a pending receipt — no later re-prompt for that same event. */
export function declineReceipt(uid: string, type: ReceiptType): Promise<Message> {
    return apiFetch(`/mail/messages/${encodeURIComponent(uid)}/receipt/decline`, {
        method: "POST",
        body: JSON.stringify({ type }),
    });
}

export interface Attachment {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    messageUid: string;
    folderUid: string;
    mailboxUid: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    isInline: boolean;
}

/** Lists the attachments belonging to a single message. */
export function listAttachments(folderUid: string, messageUid: string): Promise<Attachment[]> {
    return apiFetch(`/mail/attachments?${buildQuery({ limit: 200 }, { folderUid, messageUid })}`);
}

/** The same-origin URL to download/display an attachment's binary content — not fetched via `apiFetch`, used directly as a link/image `href`/`src`. */
export function attachmentContentUrl(uid: string): string {
    return `/api/mail/attachments/${encodeURIComponent(uid)}/content`;
}

/**
 * Uploads a file's raw bytes as a new attachment on a not-yet-sent draft. Bypasses `apiFetch` — that helper
 * always forces `Content-Type: application/json`, which would corrupt binary content; this sends the file's
 * own bytes/type directly instead, matching `BaseAttachmentRoute.upload`'s expectation of a raw request body.
 */
export async function uploadAttachment(messageUid: string, file: File): Promise<Attachment> {
    const params = new URLSearchParams({ messageUid, filename: file.name, mimeType: file.type || "application/octet-stream" });
    const res = await fetch(`/api/mail/attachments/upload?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
    });
    const contentType = res.headers.get("content-type") ?? "";
    const responseBody = contentType.includes("application/json") ? await res.json().catch(() => undefined) : undefined;
    if (!res.ok) {
        const message = (responseBody && (responseBody.message || responseBody.error)) || res.statusText || "Upload failed.";
        throw new ApiRequestError(message, res.status, responseBody?.code);
    }
    return responseBody as Attachment;
}

export interface ComposeRecipientInput {
    address: string;
    displayName?: string;
}

export interface AssembleDraftInput {
    to: ComposeRecipientInput[];
    cc?: ComposeRecipientInput[];
    bcc?: ComposeRecipientInput[];
    subject?: string;
    html: string;
}

/** Creates a blank draft `Message` in the given folder (normally the mailbox's Drafts folder) to compose into. */
export function createDraft(mailboxUid: string, folderUid: string): Promise<Message> {
    return apiFetch("/mail/messages", {
        method: "POST",
        body: JSON.stringify({ mailboxUid, folderUid, messageId: `${crypto.randomUUID()}@webmail` }),
    });
}

/**
 * Assembles a draft's structured compose input (recipients/subject/HTML body, plus whatever attachments have
 * already been `uploadAttachment()`-ed onto it) into RFC 5322 MIME and stores it as the draft's `bodyBlobKey`
 * — see `BaseMailComposeRoute` (this app's own compose-assembly glue, since `@rapidmx/restapi`'s `send()`
 * itself does no MIME composition). Does not send the message.
 */
export function assembleDraft(messageUid: string, input: AssembleDraftInput): Promise<Message> {
    return apiFetch(`/mail/compose/${encodeURIComponent(messageUid)}/assemble`, {
        method: "POST",
        body: JSON.stringify(input),
    });
}

/** Scans, relays, and moves an already-assembled draft into Sent Items. */
export function sendMessage(messageUid: string): Promise<Message> {
    return apiFetch(`/mail/messages/${encodeURIComponent(messageUid)}/send`, { method: "POST" });
}

export interface ImpersonationResult {
    token: string;
    user: { uid: string; roles: string[]; scopes: string[] };
}

/**
 * Trusted-role-only: starts an admin "log in as user" session. In production this calls auth-server
 * directly (not this app's own API) since only auth-server can mint a token carrying `userUid`'s real
 * roles/scopes the way its own sign-in flow would — see `@rapidrest/auth`'s `BaseImpersonationRoute` and
 * this repo's `.claude/NOTES.md`. The browser's `jwt` cookie is swapped for the freshly-minted token, and
 * the caller's own session is stashed (`jwt_impersonator`) so `stopImpersonating()` can restore it later.
 * The caller is responsible for navigating to `/` afterward — this call only swaps the cookie, it doesn't
 * redirect.
 *
 * @param impersonationBaseUrl The origin to call — the real auth-server in production, or `""` under
 * `yarn dev` (see `AdminConsoleRoute`/`wwwRoute`'s `fetchProps`) to instead call this app's own local
 * dev-only endpoint (`DevImpersonationRoute`), since a real auth-server isn't running locally.
 */
export function impersonateUser(impersonationBaseUrl: string, userUid: string): Promise<ImpersonationResult> {
    const init: RequestInit = { method: "POST", body: JSON.stringify({ userUid }) };
    return impersonationBaseUrl
        ? authApiFetch(impersonationBaseUrl, "/admin/impersonate", init)
        : apiFetch("/admin/impersonate", init);
}

/** Ends an active impersonation session, restoring the admin's own — a no-op (`restored: false`) if none is active. */
export function stopImpersonating(impersonationBaseUrl: string): Promise<{ restored: boolean }> {
    return impersonationBaseUrl
        ? authApiFetch(impersonationBaseUrl, "/admin/impersonate/stop", { method: "GET" })
        : apiFetch("/admin/impersonate/stop", { method: "GET" });
}
