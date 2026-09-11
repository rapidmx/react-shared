// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it } from "vitest";
import { CalendarEvent } from "../src/calendarApi.js";
import { describeRecurrence, expandAllOccurrences, expandOccurrences } from "../src/recurrence.js";

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
