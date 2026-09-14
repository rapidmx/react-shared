// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it } from "vitest";
import { CalendarEvent } from "../../src/calendar/calendarApi.js";
import { buildRRule, describeRecurrence, expandAllOccurrences, expandOccurrences } from "../../src/calendar/recurrence.js";

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
    return {
        uid: "e1",
        version: 0,
        dateCreated: "2026-01-01T00:00:00.000Z",
        dateModified: "2026-01-01T00:00:00.000Z",
        folderUid: "f1",
        mailboxUid: "mb1",
        title: "Standup",
        startDate: "2026-06-01T15:00:00.000Z",
        endDate: "2026-06-01T15:30:00.000Z",
        allDay: false,
        timezone: "UTC",
        organizer: { address: "jane@example.com", type: "to" },
        attendees: [],
        status: "confirmed",
        busyStatus: "busy",
        icalUid: "abc",
        sequence: 0,
        ...overrides,
    };
}

const RANGE_START = new Date("2026-06-01T00:00:00.000Z");
const RANGE_END = new Date("2026-06-15T00:00:00.000Z");

describe("expandOccurrences", () => {
    it("returns a non-recurring event as its own single occurrence when it overlaps the range", () => {
        const result = expandOccurrences(event(), RANGE_START, RANGE_END);
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ occurrenceKey: "e1", isRecurringOccurrence: false, startDate: "2026-06-01T15:00:00.000Z" });
    });

    it("returns nothing for a non-recurring event entirely outside the range", () => {
        const result = expandOccurrences(event({ startDate: "2026-07-01T00:00:00.000Z", endDate: "2026-07-01T01:00:00.000Z" }), RANGE_START, RANGE_END);
        expect(result).toEqual([]);
    });

    it("includes a non-recurring event that started before rangeStart but is still in progress", () => {
        const result = expandOccurrences(
            event({ startDate: "2026-05-31T23:00:00.000Z", endDate: "2026-06-01T01:00:00.000Z" }),
            RANGE_START,
            RANGE_END,
        );
        expect(result).toHaveLength(1);
    });

    it("expands a weekly recurring event into every occurrence overlapping the range", () => {
        const recurring = event({
            recurrenceRule: { freq: "weekly", interval: 1, byDay: ["MO", "WE"], exceptions: [] },
        });
        const result = expandOccurrences(recurring, RANGE_START, RANGE_END);
        expect(result.map((r) => r.startDate)).toEqual([
            "2026-06-01T15:00:00.000Z",
            "2026-06-03T15:00:00.000Z",
            "2026-06-08T15:00:00.000Z",
            "2026-06-10T15:00:00.000Z",
        ]);
        expect(result.every((r) => r.isRecurringOccurrence)).toBe(true);
        expect(result.every((r) => r.recurrenceId === r.startDate)).toBe(true);
        // Each occurrence gets a unique key derived from the master uid + its own start.
        expect(new Set(result.map((r) => r.occurrenceKey)).size).toBe(result.length);
        expect(result[0].occurrenceKey).toBe("e1::2026-06-01T15:00:00.000Z");
        // Occurrence end preserves the master event's original duration (30 minutes).
        expect(result[0].endDate).toBe("2026-06-01T15:30:00.000Z");
    });

    it("excludes occurrences listed in recurrenceRule.exceptions", () => {
        const recurring = event({
            recurrenceRule: { freq: "weekly", interval: 1, byDay: ["MO", "WE"], exceptions: ["2026-06-03T15:00:00.000Z"] },
        });
        const result = expandOccurrences(recurring, RANGE_START, RANGE_END);
        expect(result.map((r) => r.startDate)).not.toContain("2026-06-03T15:00:00.000Z");
        expect(result).toHaveLength(3);
    });

    it("includes a recurring occurrence that started before rangeStart but is still in progress", () => {
        const recurring = event({
            startDate: "2026-05-25T23:30:00.000Z",
            endDate: "2026-05-26T00:30:00.000Z",
            recurrenceRule: { freq: "daily", interval: 1, count: 8, exceptions: [] },
        });
        const result = expandOccurrences(recurring, RANGE_START, RANGE_END);
        // The occurrence anchored at 2026-06-01T00:30 starts before RANGE_START's midnight boundary by
        // half an hour on the *previous* day, so this only passes if the query window is correctly
        // widened by the event's own duration rather than starting exactly at rangeStart.
        expect(result[0].startDate).toBe("2026-05-31T23:30:00.000Z");
    });

    it("returns nothing for a recurring event whose occurrences never reach the range", () => {
        const recurring = event({
            startDate: "2026-01-01T00:00:00.000Z",
            endDate: "2026-01-01T01:00:00.000Z",
            recurrenceRule: { freq: "daily", interval: 1, count: 3, exceptions: [] },
        });
        const result = expandOccurrences(recurring, RANGE_START, RANGE_END);
        expect(result).toEqual([]);
    });
});

describe("expandOccurrences in the event's own timezone", () => {
    it("keeps a late-evening local event on its local weekday (weekly MO 23:00 America/New_York)", () => {
        // 2026-01-05 (a Monday) 23:00 EST is 2026-01-06T04:00Z, a Tuesday in UTC.
        const recurring = event({
            uid: "e",
            startDate: "2026-01-06T04:00:00.000Z",
            endDate: "2026-01-06T05:00:00.000Z",
            timezone: "America/New_York",
            recurrenceRule: { freq: "weekly", interval: 1, byDay: ["MO"], exceptions: [] },
        });
        const result = expandOccurrences(recurring, RANGE_START, RANGE_END);
        // Monday 23:00 EDT (UTC-4) is Tuesday 03:00Z — not Monday 04:00Z (Sunday evening in New York).
        expect(result.map((r) => r.startDate)).toEqual(["2026-06-02T03:00:00.000Z", "2026-06-09T03:00:00.000Z"]);
        expect(result.map((r) => r.endDate)).toEqual(["2026-06-02T04:00:00.000Z", "2026-06-09T04:00:00.000Z"]);
        expect(result[0].occurrenceKey).toBe("e::2026-06-02T03:00:00.000Z");
    });

    it("keeps 10:00 local wall-clock time across the March and November DST changes", () => {
        const recurring = event({
            startDate: "2026-03-02T15:00:00.000Z", // Mon 10:00 EST
            endDate: "2026-03-02T15:30:00.000Z",
            timezone: "America/New_York",
            recurrenceRule: { freq: "weekly", interval: 1, byDay: ["MO"], exceptions: [] },
        });
        const march = expandOccurrences(recurring, new Date("2026-03-01T00:00:00.000Z"), new Date("2026-03-17T00:00:00.000Z"));
        expect(march.map((r) => r.startDate)).toEqual([
            "2026-03-02T15:00:00.000Z", // EST
            "2026-03-09T14:00:00.000Z", // EDT (DST began 2026-03-08)
            "2026-03-16T14:00:00.000Z",
        ]);
        expect(march[1].endDate).toBe("2026-03-09T14:30:00.000Z");
        const november = expandOccurrences(recurring, new Date("2026-10-25T00:00:00.000Z"), new Date("2026-11-10T00:00:00.000Z"));
        expect(november.map((r) => r.startDate)).toEqual([
            "2026-10-26T14:00:00.000Z", // EDT
            "2026-11-02T15:00:00.000Z", // EST (DST ended 2026-11-01)
            "2026-11-09T15:00:00.000Z",
        ]);
    });

    it("keeps an early-morning local time that falls right after the spring-forward gap", () => {
        const recurring = event({
            startDate: "2026-03-06T08:30:00.000Z", // Fri 03:30 EST
            endDate: "2026-03-06T09:00:00.000Z",
            timezone: "America/New_York",
            recurrenceRule: { freq: "daily", interval: 1, count: 4, exceptions: [] },
        });
        const result = expandOccurrences(recurring, new Date("2026-03-06T00:00:00.000Z"), new Date("2026-03-10T00:00:00.000Z"));
        expect(result.map((r) => r.startDate)).toEqual([
            "2026-03-06T08:30:00.000Z",
            "2026-03-07T08:30:00.000Z",
            "2026-03-08T07:30:00.000Z", // 03:30 EDT on the transition day itself
            "2026-03-09T07:30:00.000Z",
        ]);
    });

    it("keeps an all-day event anchored at local midnight across DST", () => {
        const recurring = event({
            startDate: "2026-03-02T05:00:00.000Z", // 00:00 EST
            endDate: "2026-03-03T05:00:00.000Z",
            allDay: true,
            timezone: "America/New_York",
            recurrenceRule: { freq: "weekly", interval: 1, byDay: ["MO"], exceptions: [] },
        });
        const result = expandOccurrences(recurring, new Date("2026-03-09T12:00:00.000Z"), new Date("2026-03-09T13:00:00.000Z"));
        expect(result).toHaveLength(1);
        expect(result[0].startDate).toBe("2026-03-09T04:00:00.000Z");
        expect(result[0].endDate).toBe("2026-03-10T04:00:00.000Z");
    });

    it("interprets until and exceptions as real instants in the event's zone", () => {
        const recurring = event({
            startDate: "2026-06-01T03:00:00.000Z", // Sun 2026-05-31 23:00 EDT
            endDate: "2026-06-01T04:00:00.000Z",
            timezone: "America/New_York",
            recurrenceRule: {
                freq: "daily",
                interval: 1,
                until: "2026-06-04T03:00:00.000Z",
                exceptions: ["2026-06-02T03:00:00.000Z"],
            },
        });
        const result = expandOccurrences(recurring, RANGE_START, RANGE_END);
        expect(result.map((r) => r.startDate)).toEqual(["2026-06-01T03:00:00.000Z", "2026-06-03T03:00:00.000Z", "2026-06-04T03:00:00.000Z"]);
    });

    it("does not return padding-window occurrences that fall outside the requested range", () => {
        const recurring = event({
            startDate: "2026-05-01T14:00:00.000Z",
            endDate: "2026-05-01T15:00:00.000Z",
            timezone: "Pacific/Kiritimati", // UTC+14
            recurrenceRule: { freq: "daily", interval: 1, exceptions: [] },
        });
        const result = expandOccurrences(recurring, new Date("2026-06-05T00:00:00.000Z"), new Date("2026-06-06T00:00:00.000Z"));
        expect(result.map((r) => r.startDate)).toEqual(["2026-06-05T14:00:00.000Z"]);
    });

    describe("floating (runtime-local) fallback", () => {
        const originalTz = process.env.TZ;
        afterEach(() => {
            process.env.TZ = originalTz;
        });

        it.each([
            ["an empty timezone", ""],
            ["an unrecognized timezone", "Not/AZone"],
            ["a missing timezone", undefined],
        ])("expands %s in the runtime's local zone", (_label, timezone) => {
            // Node applies a runtime `process.env.TZ` change to `Date`'s local-time methods immediately.
            process.env.TZ = "America/New_York";
            const recurring = event({
                startDate: "2026-03-02T15:00:00.000Z", // Mon 10:00 EST (local)
                endDate: "2026-03-02T15:30:00.000Z",
                timezone: timezone as string,
                recurrenceRule: { freq: "weekly", interval: 1, byDay: ["MO"], exceptions: [] },
            });
            const result = expandOccurrences(recurring, new Date("2026-03-01T00:00:00.000Z"), new Date("2026-03-10T00:00:00.000Z"));
            expect(result.map((r) => r.startDate)).toEqual(["2026-03-02T15:00:00.000Z", "2026-03-09T14:00:00.000Z"]);
            expect(result[1].endDate).toBe("2026-03-09T14:30:00.000Z");
        });
    });
});

describe("buildRRule", () => {
    it("carries the given tzid through to the rule", () => {
        const rule = buildRRule({ freq: "weekly", interval: 1, byDay: ["MO"], exceptions: [] }, new Date(Date.UTC(2026, 0, 5, 23)), "America/New_York");
        expect(rule.options.tzid).toBe("America/New_York");
        expect(rule.toString()).toContain("DTSTART;TZID=America/New_York:20260105T230000");
    });

    it("builds a UTC rule with an until date when no tzid is given", () => {
        const rule = buildRRule({ freq: "daily", interval: 1, until: "2026-01-07T00:00:00.000Z", exceptions: [] }, new Date("2026-01-05T00:00:00.000Z"));
        expect(rule.options.tzid).toBeNull();
        expect(rule.all()).toHaveLength(3);
    });
});

describe("expandAllOccurrences", () => {
    it("expands and flattens every event", () => {
        const e1 = event({ uid: "e1" });
        const e2 = event({ uid: "e2", startDate: "2026-06-05T10:00:00.000Z", endDate: "2026-06-05T11:00:00.000Z" });
        const result = expandAllOccurrences([e1, e2], RANGE_START, RANGE_END);
        expect(result.map((r) => r.uid).sort()).toEqual(["e1", "e2"]);
    });
});

describe("describeRecurrence", () => {
    it("describes a weekly rule with specific days", () => {
        expect(describeRecurrence({ freq: "weekly", interval: 1, byDay: ["MO", "WE"], exceptions: [] })).toBe(
            "every week on Monday, Wednesday",
        );
    });

    it("describes an interval-2 rule with an until date", () => {
        expect(describeRecurrence({ freq: "weekly", interval: 2, byDay: ["MO"], until: "2027-01-01T00:00:00.000Z", exceptions: [] })).toBe(
            "every 2 weeks on Monday until January 1, 2027",
        );
    });

    it("describes a monthly rule with a count", () => {
        expect(describeRecurrence({ freq: "monthly", interval: 1, count: 6, exceptions: [] })).toBe("every month for 6 times");
    });

    it("describes a daily rule with no end condition", () => {
        expect(describeRecurrence({ freq: "daily", interval: 1, exceptions: [] })).toBe("every day");
    });

    it("describes a yearly rule", () => {
        expect(describeRecurrence({ freq: "yearly", interval: 1, exceptions: [] })).toBe("every year");
    });
});
