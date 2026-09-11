// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it } from "vitest";
import { CalendarOccurrence } from "../src/recurrence.js";
import {
    dayDropId,
    eventDragId,
    resizeDragId,
    resolveDragAction,
    slotDropId,
} from "../src/calendarDragIds.js";

function occurrence(overrides: Partial<CalendarOccurrence> = {}): CalendarOccurrence {
    return {
        uid: "e1",
        version: 2,
        dateCreated: "2026-01-01T00:00:00.000Z",
        dateModified: "2026-01-01T00:00:00.000Z",
        folderUid: "f1",
        mailboxUid: "mb1",
        title: "Standup",
        startDate: "2026-06-03T15:00:00.000Z",
        endDate: "2026-06-03T15:30:00.000Z",
        allDay: false,
        timezone: "UTC",
        organizer: { address: "jane@example.com", type: "to" },
        attendees: [],
        status: "confirmed",
        busyStatus: "busy",
        icalUid: "abc",
        sequence: 0,
        occurrenceKey: "e1",
        isRecurringOccurrence: false,
        ...overrides,
    };
}

describe("id encoding", () => {
    it("dayDropId/slotDropId/eventDragId/resizeDragId produce distinct, round-trippable prefixed ids", () => {
        const day = new Date("2026-06-10T00:00:00.000Z");
        expect(dayDropId(day)).toBe("day:2026-06-10");
        expect(slotDropId(new Date("2026-06-10T09:30:00.000Z"))).toBe("slot:2026-06-10T09:30:00.000Z");
        const occ = occurrence();
        expect(eventDragId(occ)).toBe("e1");
        expect(resizeDragId(occ)).toBe("resize:e1");
    });
});

describe("resolveDragAction", () => {
    it("returns null when dropped outside any droppable", () => {
        expect(resolveDragAction("e1", undefined, [occurrence()])).toBeNull();
    });

    it("returns null when the dragged occurrence can't be found (e.g. removed by a mid-drag reload)", () => {
        expect(resolveDragAction("does-not-exist", "day:2026-06-10", [occurrence()])).toBeNull();
    });

    it("resolves a drop on a day cell to a move, computing the day delta in ms", () => {
        const action = resolveDragAction("e1", "day:2026-06-05", [occurrence()]);
        expect(action).toEqual({ type: "move", occurrence: occurrence(), deltaMs: 2 * 24 * 60 * 60 * 1000 });
    });

    it("resolves a drop on a day cell before the event's own day to a negative delta", () => {
        const action = resolveDragAction("e1", "day:2026-06-01", [occurrence()]);
        expect(action).toEqual({ type: "move", occurrence: occurrence(), deltaMs: -2 * 24 * 60 * 60 * 1000 });
    });

    it("resolves a drop on a time slot to a move, computing the exact ms delta", () => {
        const action = resolveDragAction("e1", "slot:2026-06-03T16:00:00.000Z", [occurrence()]);
        expect(action).toEqual({ type: "move", occurrence: occurrence(), deltaMs: 60 * 60 * 1000 });
    });

    it("resolves a resize-handle drag onto a time slot to a resize with that slot as the new end", () => {
        const action = resolveDragAction("resize:e1", "slot:2026-06-03T16:00:00.000Z", [occurrence()]);
        expect(action).toEqual({ type: "resize", occurrence: occurrence(), newEnd: new Date("2026-06-03T16:00:00.000Z") });
    });

    it("returns null when a resize handle is dropped on a day cell instead of a time slot", () => {
        expect(resolveDragAction("resize:e1", "day:2026-06-05", [occurrence()])).toBeNull();
    });

    it("returns null for an unrecognized over-id prefix", () => {
        expect(resolveDragAction("e1", "something-else", [occurrence()])).toBeNull();
    });

    it("finds the right occurrence among several by matching occurrenceKey exactly", () => {
        const a = occurrence({ occurrenceKey: "a" });
        const b = occurrence({ occurrenceKey: "b", startDate: "2026-06-04T10:00:00.000Z", endDate: "2026-06-04T10:30:00.000Z" });
        const action = resolveDragAction("b", "day:2026-06-05", [a, b]);
        expect(action).toMatchObject({ occurrence: b });
    });
});
