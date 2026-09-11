///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * RFC5545 recurrence expansion, entirely client-side — `@rapidmx/restapi` stores/returns
 * `RecurrenceRule` as-is and does no expansion of its own (see `calendarApi.ts`'s own header
 * comment). Built on the `rrule` package.
 */

// `rrule` ships a real ESM build (resolved by the client bundler via its own module graph, where
// named imports work normally) alongside a separate CJS build with no `"exports"` map (resolved by
// this framework's *server-side* render path via Node's own loader, which falls back to the CJS
// build since "module" is a bundler-only convention Node itself doesn't honor). Node's static
// named-export detection for that CJS build doesn't pick up `RRule` (confirmed directly: SSR-ing the
// calendar page threw "does not provide an export named 'RRule'"), so a plain named import breaks
// under SSR even though it works in the browser. A namespace import sidesteps the static check
// entirely; reading `.default` afterward reaches the same class via Node's CJS interop (`default`
// always aliases `module.exports` for a CJS module) without disturbing the ESM path, where `.default`
// simply doesn't exist and the direct named property is used instead.
import * as RRuleNS from "rrule";
import type { Weekday } from "rrule";
import { CalendarEvent, RecurrenceRule, WeekdayCode } from "./calendarApi.js";

/** Extracted so the CJS-interop fallback branch can be exercised directly with a plain object,
 * without needing to fight a module mock into reproducing Node's exact interop shape. */
export function resolveRRuleExport(ns: typeof RRuleNS): typeof RRuleNS.RRule {
    return ns.RRule ?? (ns as unknown as { default: typeof RRuleNS }).default.RRule;
}

const RRule = resolveRRuleExport(RRuleNS);

const FREQ_MAP: Record<RecurrenceRule["freq"], number> = {
    yearly: RRule.YEARLY,
    monthly: RRule.MONTHLY,
    weekly: RRule.WEEKLY,
    daily: RRule.DAILY,
};

// `RRule`'s own `.toText()` formatter requires actual `Weekday` instances in `byweekday` — passing the
// raw two-letter strings works for occurrence expansion (`.between()`) but throws inside `.toText()`
// (confirmed by reproducing it directly against this exact package version).
const WEEKDAY_OBJECT: Record<WeekdayCode, Weekday> = {
    MO: RRule.MO,
    TU: RRule.TU,
    WE: RRule.WE,
    TH: RRule.TH,
    FR: RRule.FR,
    SA: RRule.SA,
    SU: RRule.SU,
};

/** Builds an `RRule` instance from this app's `RecurrenceRule` shape, anchored at `dtstart`. */
export function buildRRule(rule: RecurrenceRule, dtstart: Date): RRuleNS.RRule {
    return new RRule({
        freq: FREQ_MAP[rule.freq],
        interval: rule.interval,
        dtstart,
        byweekday: rule.byDay?.map((code) => WEEKDAY_OBJECT[code]),
        bymonthday: rule.byMonthDay,
        bymonth: rule.byMonth,
        count: rule.count,
        until: rule.until ? new Date(rule.until) : null,
    });
}

/** A single expanded occurrence of a (possibly recurring) `CalendarEvent`, ready to render on a grid. */
export interface CalendarOccurrence extends CalendarEvent {
    /** A key unique per occurrence (`${event.uid}::${occurrence start}`) — use this for React `key`s and
     * drag-and-drop ids, since a recurring event's `uid` alone isn't unique across its occurrences. */
    occurrenceKey: string;
    /** `true` for a generated occurrence of a recurring event (as opposed to the stored master record, or
     * a genuinely non-recurring event) — moving/resizing one calls `updateCalendarEvent` differently (see
     * the calendar page's own drag handlers) since it must detach into its own standalone event. */
    isRecurringOccurrence: boolean;
}

/**
 * Expands `event` into every occurrence whose interval overlaps `[rangeStart, rangeEnd]`. A
 * non-recurring event yields itself (in a one-element array) if it overlaps, or `[]` otherwise —
 * callers don't need to special-case recurring vs. not.
 */
export function expandOccurrences(event: CalendarEvent, rangeStart: Date, rangeEnd: Date): CalendarOccurrence[] {
    const start = new Date(event.startDate);
    const end = new Date(event.endDate);
    const durationMs = end.getTime() - start.getTime();

    if (!event.recurrenceRule) {
        const overlaps = start < rangeEnd && end > rangeStart;
        return overlaps ? [{ ...event, occurrenceKey: event.uid, isRecurringOccurrence: false }] : [];
    }

    const rule = buildRRule(event.recurrenceRule, start);
    // Widen the query window by one occurrence's duration so an occurrence that started before
    // `rangeStart` but is still in progress (still overlaps the visible window) isn't missed.
    const queryStart = new Date(rangeStart.getTime() - durationMs);
    const occurrenceStarts = rule.between(queryStart, rangeEnd, true);
    const exceptions = new Set(event.recurrenceRule.exceptions.map((d) => new Date(d).getTime()));

    return occurrenceStarts
        .filter((occStart) => !exceptions.has(occStart.getTime()))
        .map((occStart) => {
            const occEnd = new Date(occStart.getTime() + durationMs);
            return {
                ...event,
                startDate: occStart.toISOString(),
                endDate: occEnd.toISOString(),
                recurrenceId: occStart.toISOString(),
                occurrenceKey: `${event.uid}::${occStart.toISOString()}`,
                isRecurringOccurrence: true,
            };
        })
        .filter((occ) => new Date(occ.startDate) < rangeEnd && new Date(occ.endDate) > rangeStart);
}

/** Expands every event in `events` and flattens the result — the usual entry point for a grid view. */
export function expandAllOccurrences(events: CalendarEvent[], rangeStart: Date, rangeEnd: Date): CalendarOccurrence[] {
    return events.flatMap((event) => expandOccurrences(event, rangeStart, rangeEnd));
}

/** A human-readable summary of `rule` (e.g. "every 2 weeks on Monday, Wednesday until Jan 1, 2027"). */
export function describeRecurrence(rule: RecurrenceRule): string {
    const rrule = buildRRule(rule, new Date());
    return rrule.toText();
}

export const WEEKDAY_CODES: WeekdayCode[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
export const WEEKDAY_LABELS: Record<WeekdayCode, string> = {
    MO: "Mon",
    TU: "Tue",
    WE: "Wed",
    TH: "Thu",
    FR: "Fri",
    SA: "Sat",
    SU: "Sun",
};
