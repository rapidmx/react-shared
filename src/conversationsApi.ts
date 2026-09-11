///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Typed wrapper over `@rapidmx/restapi`'s `GET /messages/conversations` route
 * (`BaseMessageRoute.conversations()`) — groups a mailbox's messages by RFC 5322 References/In-Reply-To
 * threading (`Message.conversationId`), one summary row per conversation spanning every folder in the
 * mailbox, newest activity first. Read-only and computed fresh on every call — a `ConversationSummary`
 * is never itself persisted.
 */

import { apiFetch } from "./api.js";
import { Recipient } from "./mailApi.js";

export interface ConversationSummary {
    conversationId: string;
    /** The most recent message's subject line. */
    subject: string;
    /** Every message in this conversation, oldest to newest. */
    messageUids: string[];
    /** Every folder (deduped) this conversation has a message in — a conversation can span folders,
     * e.g. an Inbox message and the Sent Items copy of its reply. */
    folderUids: string[];
    messageCount: number;
    unreadCount: number;
    /** The most recent message's `receivedDate` — what the list is sorted by (newest first). */
    latestDate: string;
    /** Every distinct participant (deduped by address) across every message in the conversation. */
    participants: Recipient[];
    hasAttachments: boolean;
}

/** Conversations are computed mailbox-wide, not folder-scoped — there is no `folderUid` filter here. */
export function listConversations(mailboxUid: string): Promise<ConversationSummary[]> {
    return apiFetch(`/mail/messages/conversations?mailboxUid=${encodeURIComponent(mailboxUid)}`);
}
