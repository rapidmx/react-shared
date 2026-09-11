///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Backs Tasks' "Flagged email" smart-list (an Outlook To-Do concept: flagged *Messages*, not Tasks,
 * surfaced into the Tasks app). `Message.flags.flagged` already exists — no new backend field needed —
 * but there's no way to ask the server for "every flagged message in this mailbox" in one call:
 * `MessageSQL.flags` is a `simple-json` column, so the generic query-operator DSL this framework's
 * `find()` relies on elsewhere can't filter on a nested field within it, on either Mongo or SQL
 * consistently. This fans out one `listMessages()` call per mail folder instead and filters client-side.
 */
import { Folder, Message, listFolders, listMessages } from "./mailApi.js";

/** Folder types that actually hold `Message` records — mirrors `MailShell.tsx`'s own `MAIL_FOLDER_TYPES`
 * allowlist (kept as a separate local copy rather than a shared export, since the two call sites have no
 * other coupling and this list is small/stable). */
const MAIL_FOLDER_TYPES = new Set(["inbox", "drafts", "outbox", "sent_items", "junk", "deleted_items", "user"]);

/** Lists every flagged message across all of a mailbox's mail folders (not just Inbox), newest first. */
export async function listFlaggedMessages(mailboxUid: string): Promise<Message[]> {
    const folders: Folder[] = await listFolders(mailboxUid);
    const mailFolders = folders.filter((f) => MAIL_FOLDER_TYPES.has(f.type));
    const perFolder = await Promise.all(mailFolders.map((f) => listMessages(f.uid, { limit: 500 })));
    return perFolder
        .flat()
        .filter((m) => m.flags.flagged)
        .sort((a, b) => new Date(b.receivedDate).getTime() - new Date(a.receivedDate).getTime());
}
