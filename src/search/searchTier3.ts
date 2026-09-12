///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Tier 3 — server-assisted narrowing (`specs/search.md` §6/§14): for an encrypted message, the
 * server's own index has no `body`/`subject` field to match free text against (§2) - a free-text query
 * can only ever surface one via a `participants` coincidence or a pure-operator query. This module
 * closes that gap: it asks the server to narrow by metadata it can actually see (participants, dates,
 * folder, flags - never content, via `searchApi.ts#candidates()`), then fetches, decrypts, and matches
 * each candidate's real content client-side - the part the server structurally cannot do.
 *
 * **No new leakage** (§6): the server never learns which candidate actually matched, only that this
 * client asked about a bounded set of participants/dates/folders it could already see for delivery.
 *
 * Deliberately scoped to `entityType: "message"` only - contacts are never encrypted (Tier 1 already
 * covers them in full), and calendarEvent/note/task encryption has no client-side decrypt path
 * anywhere in this codebase yet (no calendar/notes/tasks E2E UI has been built), so including those
 * types here would just produce fetch/decrypt failures for entities this module has no way to open.
 */
import type { UnlockedKeys } from "../crypto/keySession.js";
import { evaluateMessageSecurity } from "../crypto/messageSecurity.js";
import { getMessageRawContent } from "../mail/mailApi.js";
import type { ParsedSearchQuery } from "./queryGrammar.js";
import { SEARCH_FIELD_WEIGHTS } from "./searchScoring.js";
import { candidates, SearchResult } from "./searchApi.js";

/** Strips HTML down to plain text for content matching. Deliberately not `dompurify` (used elsewhere
 * in this codebase for sanitizing a decrypted body before it touches a real DOM) - `dompurify` only
 * produces a working `sanitize()` once handed a real `window`, which this module cannot assume: it
 * needs to run identically in a browser tab, an Electron renderer, and this package's own Node-based
 * test suite (no jsdom - `pkijs`'s ECDH key derivation, which every test here depends on, breaks under
 * jsdom's WebCrypto shim). This is not a security boundary - the output only ever feeds a
 * case-insensitive substring match, never rendered back into any DOM - so a plain regex is sufficient
 * and, unlike `dompurify`, behaves identically across every environment this module runs in. */
function stripHtml(html: string): string {
    return html
        .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#0*39;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
}

/** `true` when every whitespace-separated term in `queryText` appears case-insensitively somewhere in
 * `haystack` - AND semantics, matching how a plain free-text search box query reads intuitively. An
 * empty `queryText` (a pure-operator query - the operators themselves already did the narrowing)
 * matches unconditionally. */
function matchesFreeText(queryText: string, haystack: string): boolean {
    const terms = queryText.split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
        return true;
    }
    const lowerHaystack = haystack.toLowerCase();
    return terms.every((term) => lowerHaystack.includes(term.toLowerCase()));
}

/** Counts (case-insensitive, overlapping-safe-enough for scoring purposes) occurrences of every term
 * in `queryText` within `haystack` - used only to weight a match's score, not to decide whether it
 * matches at all (`matchesFreeText()` already decided that). */
function countTermOccurrences(queryText: string, haystack: string): number {
    const terms = queryText.split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
        return 1;
    }
    const lowerHaystack = haystack.toLowerCase();
    return terms.reduce((total, term) => {
        const lowerTerm = term.toLowerCase();
        let count = 0;
        let index = lowerHaystack.indexOf(lowerTerm);
        while (index !== -1) {
            count += 1;
            index = lowerHaystack.indexOf(lowerTerm, index + lowerTerm.length);
        }
        return total + count;
    }, 0);
}

/** Builds a snippet the same way `specs/search.md` §7 "Snippets" requires for a Tier 3 result -
 * "the client MUST generate snippets locally for any result it has decrypted... so snippet presence
 * does not visibly differ by tier." A window of context around the first matched term when there is
 * free text to match on, otherwise the start of the body (falling back to the subject if the body is
 * empty). Never called with both `subjectText`/`bodyText` empty - the caller's own
 * `!security.html && !security.subject` guard already discards a candidate with nothing at all before
 * reaching this function. */
function buildSnippet(queryText: string, subjectText: string, bodyText: string): string {
    const source = bodyText || subjectText;
    const terms = queryText.split(/\s+/).filter(Boolean);
    const lowerSource = source.toLowerCase();
    let matchIndex = -1;
    for (const term of terms) {
        const index = lowerSource.indexOf(term.toLowerCase());
        if (index !== -1 && (matchIndex === -1 || index < matchIndex)) {
            matchIndex = index;
        }
    }
    const CONTEXT_BEFORE = 40;
    const CONTEXT_AFTER = 100;
    const start = matchIndex === -1 ? 0 : Math.max(0, matchIndex - CONTEXT_BEFORE);
    const end = matchIndex === -1 ? Math.min(source.length, CONTEXT_BEFORE + CONTEXT_AFTER) : Math.min(source.length, matchIndex + CONTEXT_AFTER);
    const prefix = start > 0 ? "…" : "";
    const suffix = end < source.length ? "…" : "";
    return `${prefix}${source.slice(start, end).trim()}${suffix}`;
}

function hasAnyFilter(parsed: ParsedSearchQuery): boolean {
    return Boolean(
        parsed.text ||
            parsed.from ||
            parsed.to ||
            parsed.cc ||
            parsed.subject ||
            parsed.hasAttachment !== undefined ||
            parsed.before ||
            parsed.after ||
            parsed.folderUid ||
            parsed.flags?.length ||
            parsed.labels?.length,
    );
}

/**
 * Runs Tier 3 for one parsed query: fetches a bounded candidate set from the server, decrypts each
 * candidate this device can open, and returns only the ones whose real (decrypted) content actually
 * matches - each with a raw (not yet normalized) score the caller should run through
 * `searchScoring.ts#normalizeServerScores()` alongside Tier 1's own scores before merging.
 *
 * Returns `[]` (never throws) when `unlocked` is absent - nothing can be decrypted without it, so
 * there is nothing this tier can contribute - or when the query has no free text and no structured
 * filter at all, mirroring `BaseSearchRoute`'s own "at least one of q or a filter" requirement rather
 * than pulling a pointless full-mailbox candidate set.
 */
export async function searchEncryptedCandidates(
    parsed: ParsedSearchQuery,
    unlocked: UnlockedKeys | undefined,
    limit = 50,
): Promise<SearchResult[]> {
    if (!unlocked || !hasAnyFilter(parsed)) {
        return [];
    }

    const participants = [parsed.from, parsed.to, parsed.cc].filter((value): value is string => Boolean(value));

    const page = await candidates({
        types: ["message"],
        participants: participants.length > 0 ? participants : undefined,
        before: parsed.before,
        after: parsed.after,
        folderUid: parsed.folderUid,
        flags: parsed.flags,
        labels: parsed.labels,
        limit,
    });

    const settled = await Promise.allSettled(
        page.candidates
            .filter((candidate) => candidate.entityType === "message")
            .map(async (candidate) => {
                const rawMime = await getMessageRawContent(candidate.entityUid);
                const security = await evaluateMessageSecurity(rawMime, unlocked);
                return { entityUid: candidate.entityUid, security };
            }),
    );

    const results: SearchResult[] = [];
    for (const outcome of settled) {
        if (outcome.status === "rejected") {
            continue;
        }
        const { entityUid, security } = outcome.value;
        if (!security.html && !security.subject) {
            // Nothing recovered - unprotected with no content override, a failed decrypt, or a
            // signature failure with no body - this candidate contributes nothing Tier 1 didn't
            // already have a chance to see, so there's no point matching against it here.
            continue;
        }
        const subjectText = security.subject ?? "";
        const bodyText = security.html ? stripHtml(security.html) : "";
        const haystack = `${subjectText} ${bodyText}`;
        if (!matchesFreeText(parsed.text, haystack)) {
            continue;
        }
        const score =
            countTermOccurrences(parsed.text, subjectText) * SEARCH_FIELD_WEIGHTS.subject +
            countTermOccurrences(parsed.text, bodyText) * SEARCH_FIELD_WEIGHTS.body;
        results.push({
            entityType: "message",
            entityUid,
            score,
            source: "candidate",
            metadataOnly: false,
            snippet: buildSnippet(parsed.text, subjectText, bodyText),
        });
    }
    return results;
}
