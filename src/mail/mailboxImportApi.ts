///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Typed wrappers over `@rapidmx/restapi`'s GDPR data-portability import (`BaseMailboxImportRoute`,
 * mounted at `mail/mailbox-import-requests`) — the counterpart to `dataExportApi.ts`. Import runs
 * asynchronously (restapi's own `MailboxImportJob`, not this client) — `uploadMailboxImport()` only
 * stages the upload and returns the `pending` request; poll `getImportRequest()`/`listImportRequests()`
 * for `status` to become `"completed"` (with `importedCount`/`failedCount`) or `"failed"`.
 */
import { ApiRequestError, apiFetch } from "../util/api.js";

export type MailboxImportFormat = "mbox" | "pst";
export type MailboxImportStatus = "pending" | "processing" | "completed" | "failed";

export interface MailboxImportRequest {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    mailboxUid: string;
    requestedByUserUid: string;
    targetFolderUid: string;
    format: MailboxImportFormat;
    sourceBlobKey: string;
    status: MailboxImportStatus;
    importedCount?: number;
    failedCount?: number;
    errorMessage?: string;
}

export interface UploadMailboxImportInput {
    format: MailboxImportFormat;
    targetFolderUid: string;
    /** Only honored when the caller is a trusted admin — an ordinary caller's own mailbox is always
     * used, regardless of what (if anything) is supplied here. */
    mailboxUid?: string;
}

/**
 * Uploads `file`'s raw bytes as a new mailbox-import request. Bypasses `apiFetch` — that helper always
 * forces `Content-Type: application/json`, which would corrupt binary content; this sends the file's own
 * bytes directly instead, matching `BaseMailboxImportRoute.create()`'s expectation of a raw request body
 * with `format`/`targetFolderUid`/`mailboxUid` as query-string parameters, not a JSON body — the same
 * shape `mailApi.ts`'s `uploadAttachment()` already establishes for a raw-bytes upload.
 */
export async function uploadMailboxImport(file: File, input: UploadMailboxImportInput): Promise<MailboxImportRequest> {
    const params = new URLSearchParams({ format: input.format, targetFolderUid: input.targetFolderUid });
    if (input.mailboxUid) {
        params.set("mailboxUid", input.mailboxUid);
    }
    const res = await fetch(`/api/mail/mailbox-import-requests?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": input.format === "pst" ? "application/vnd.ms-outlook" : "application/mbox" },
        body: file,
    });
    const contentType = res.headers.get("content-type") ?? "";
    const responseBody = contentType.includes("application/json") ? await res.json().catch(() => undefined) : undefined;
    if (!res.ok) {
        const message = (responseBody && (responseBody.message || responseBody.error)) || res.statusText || "Upload failed.";
        throw new ApiRequestError(message, res.status, responseBody?.code);
    }
    return responseBody as MailboxImportRequest;
}

/** A trusted caller sees every request; anyone else sees only their own (`requestedByUserUid`). */
export function listImportRequests(): Promise<MailboxImportRequest[]> {
    return apiFetch(`/mail/mailbox-import-requests`);
}

export function getImportRequest(uid: string): Promise<MailboxImportRequest> {
    return apiFetch(`/mail/mailbox-import-requests/${encodeURIComponent(uid)}`);
}
