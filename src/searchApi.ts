///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Client wrapper for `@rapidmx/restapi`'s `BaseSearchRoute` (mounted at `/mail/search` — see
 * `src/mongo/routes/SearchRoute.ts`/`src/sql/routes/SearchRoute.ts`), the full-text search endpoint across
 * a mailbox's messages/contacts/calendar events/notes/tasks. Always scoped server-side to the caller's own
 * mailbox — there is no `mailboxUid` param to pass here.
 */
import { apiFetch } from "./api.js";

export type SearchEntityType = "message" | "contact" | "calendarEvent" | "note" | "task";

export interface SearchResult {
    entityType: SearchEntityType;
    entityUid: string;
    score: number;
    /** A short, provider-generated snippet highlighting the matched text, if supported. */
    snippet?: string;
}

export interface SearchResultPage {
    results: SearchResult[];
    /** Opaque cursor to pass back as `cursor` to retrieve the next page, if more results exist. */
    nextCursor?: string;
}

export interface SearchParams {
    types?: SearchEntityType[];
    cursor?: string;
    limit?: number;
}

export function search(text: string, params: SearchParams = {}): Promise<SearchResultPage> {
    const query = new URLSearchParams({ q: text });
    if (params.types?.length) {
        query.set("types", params.types.join(","));
    }
    if (params.cursor) {
        query.set("cursor", params.cursor);
    }
    if (params.limit) {
        query.set("limit", String(params.limit));
    }
    return apiFetch(`/mail/search?${query.toString()}`);
}
