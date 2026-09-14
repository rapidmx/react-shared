// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyResponse, jsonResponse, mockFetch } from "../testUtils.js";
import { CalendarOccurrence } from "../../src/calendar/recurrence.js";
import {
    deleteEventOccurrence,
    deleteEventSeries,
    detachOccurrence,
    moveOccurrence,
    resizeOccurrenceEnd,
    saveEventSeries,
} from "../../src/calendar/calendarMutations.js";

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
        recurrenceRule: { freq: "weekly", interval: 1, byDay: ["MO", "WE"], exceptions: [] },
        recurrenceId: "2026-06-03T15:00:00.000Z",
        occurrenceKey: "e1::2026-06-03T15:00:00.000Z",
        isRecurringOccurrence: true,
        ...overrides,
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("saveEventSeries", () => {
    it("PUTs the edited fields onto the master event", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, occurrence({ title: "Renamed" })));
        const result = await saveEventSeries(occurrence(), { title: "Renamed" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/calendar-events/e1",
            expect.objectContaining({ method: "PUT", body: JSON.stringify({ uid: "e1", version: 2, title: "Renamed" }) }),
        );
        expect(result.title).toBe("Renamed");
    });
});

describe("detachOccurrence", () => {
    it("adds an exception to the master and creates a standalone event with the edited fields", async () => {
        const created = occurrence({ uid: "e2", title: "Renamed", recurrenceRule: undefined, occurrenceKey: "e2", isRecurringOccurrence: false });
        const fetchMock = mockFetch((url, init) => {
            if (url === "/api/mail/calendar-events/e1" && init?.method === "PUT") {
                const body = JSON.parse(init.body as string);
                return jsonResponse(200, { ...occurrence(), recurrenceRule: body.recurrenceRule });
            }
            if (url === "/api/mail/calendar-events" && init?.method === "POST") {
                return jsonResponse(200, created);
            }
            throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
        });

        const result = await detachOccurrence(occurrence(), { title: "Renamed" });

        // The master's exceptions list grew by exactly the detached occurrence's original start.
        const putCall = fetchMock.mock.calls.find((c) => c[0] === "/api/mail/calendar-events/e1")!;
        const putBody = JSON.parse((putCall[1] as RequestInit).body as string);
        expect(putBody.recurrenceRule.exceptions).toEqual(["2026-06-03T15:00:00.000Z"]);

        // The new standalone event carries the master's own fields plus the edit, not a recurrence rule.
        const postCall = fetchMock.mock.calls.find((c) => c[0] === "/api/mail/calendar-events" && (c[1] as RequestInit).method === "POST")!;
        const postBody = JSON.parse((postCall[1] as RequestInit).body as string);
        expect(postBody).toEqual(
            expect.objectContaining({
                mailboxUid: "mb1",
                folderUid: "f1",
                title: "Renamed",
                startDate: "2026-06-03T15:00:00.000Z",
                organizer: { address: "jane@example.com", type: "to" },
            }),
        );
        expect(postBody.recurrenceRule).toBeUndefined();
        expect(result.uid).toBe("e2");
    });

    it("creates the detached event before excluding the occurrence from the master", async () => {
        const fetchMock = mockFetch((url, init) =>
            init?.method === "POST" ? jsonResponse(200, occurrence({ uid: "e2" })) : jsonResponse(200, occurrence()),
        );
        await detachOccurrence(occurrence(), { title: "Renamed" });
        expect(fetchMock.mock.calls.map((c) => `${(c[1] as RequestInit).method} ${c[0]}`)).toEqual([
            "POST /api/mail/calendar-events",
            "PUT /api/mail/calendar-events/e1",
        ]);
    });

    it("keeps the master's icalUid and autoReply fields, sets recurrenceId, and never copies a recurrenceRule", async () => {
        const fetchMock = mockFetch((url, init) =>
            init?.method === "POST" ? jsonResponse(200, occurrence({ uid: "e2" })) : jsonResponse(200, occurrence()),
        );
        const master = occurrence({ icalUid: "series-ical", autoReplyEnabled: true, autoReplyMessage: "Away" });

        // The event modal passes its full field set, including the series' own recurrence rule.
        await detachOccurrence(master, { title: "Renamed", recurrenceRule: master.recurrenceRule });

        const postCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit).method === "POST")!;
        const postBody = JSON.parse((postCall[1] as RequestInit).body as string);
        expect(postBody).toMatchObject({
            icalUid: "series-ical",
            recurrenceId: "2026-06-03T15:00:00.000Z",
            autoReplyEnabled: true,
            autoReplyMessage: "Away",
            title: "Renamed",
        });
        expect("recurrenceRule" in postBody).toBe(false);
    });

    it("deletes the created detached event and rethrows when adding the exception fails", async () => {
        const fetchMock = mockFetch((url, init) => {
            if (init?.method === "POST") return jsonResponse(200, occurrence({ uid: "e2", version: 0 }));
            if (init?.method === "PUT") return jsonResponse(409, { message: "version conflict" });
            return emptyResponse(200);
        });

        await expect(detachOccurrence(occurrence(), { title: "Renamed" })).rejects.toThrow();

        expect(fetchMock).toHaveBeenCalledWith("/api/mail/calendar-events/e2?version=0", expect.objectContaining({ method: "DELETE" }));
    });

    it("still rethrows the original error when the rollback delete also fails", async () => {
        mockFetch((url, init) => {
            if (init?.method === "POST") return jsonResponse(200, occurrence({ uid: "e2", version: 0 }));
            if (init?.method === "PUT") return jsonResponse(409, { message: "version conflict" });
            return jsonResponse(500, { message: "rollback failed" });
        });

        await expect(detachOccurrence(occurrence(), { title: "Renamed" })).rejects.toThrow("version conflict");
    });

    it("does not touch the master when creating the detached event fails", async () => {
        const fetchMock = mockFetch(() => jsonResponse(500, { message: "create failed" }));
        await expect(detachOccurrence(occurrence(), { title: "Renamed" })).rejects.toThrow();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
    });
});

describe("deleteEventSeries", () => {
    it("DELETEs the master event outright", async () => {
        const fetchMock = mockFetch(() => emptyResponse(200));
        await deleteEventSeries(occurrence());
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/calendar-events/e1?version=2", expect.objectContaining({ method: "DELETE" }));
    });
});

describe("deleteEventOccurrence", () => {
    it("adds an exception to the master, leaving the rest of the series intact", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, occurrence()));
        await deleteEventOccurrence(occurrence());
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/calendar-events/e1",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({
                    uid: "e1",
                    version: 2,
                    recurrenceRule: { freq: "weekly", interval: 1, byDay: ["MO", "WE"], exceptions: ["2026-06-03T15:00:00.000Z"] },
                }),
            }),
        );
    });
});

describe("moveOccurrence", () => {
    it("shifts a non-recurring event's start/end by deltaMs, preserving duration, via a plain PUT", async () => {
        const nonRecurring = occurrence({ recurrenceRule: undefined, isRecurringOccurrence: false, occurrenceKey: "e1" });
        const fetchMock = mockFetch(() => jsonResponse(200, nonRecurring));
        const oneDayMs = 24 * 60 * 60 * 1000;

        await moveOccurrence(nonRecurring, oneDayMs);

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/calendar-events/e1",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({
                    uid: "e1",
                    version: 2,
                    startDate: "2026-06-04T15:00:00.000Z",
                    endDate: "2026-06-04T15:30:00.000Z",
                }),
            }),
        );
    });

    it("detaches a recurring occurrence into its own standalone event when moved", async () => {
        const fetchMock = mockFetch((url, init) => {
            if (url === "/api/mail/calendar-events/e1" && init?.method === "PUT") return jsonResponse(200, occurrence());
            if (url === "/api/mail/calendar-events" && init?.method === "POST") return jsonResponse(200, occurrence({ uid: "e2" }));
            throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
        });
        const oneHourMs = 60 * 60 * 1000;

        const result = await moveOccurrence(occurrence(), oneHourMs);

        const postCall = fetchMock.mock.calls.find((c) => c[0] === "/api/mail/calendar-events" && (c[1] as RequestInit).method === "POST")!;
        const postBody = JSON.parse((postCall[1] as RequestInit).body as string);
        expect(postBody.startDate).toBe("2026-06-03T16:00:00.000Z");
        expect(postBody.endDate).toBe("2026-06-03T16:30:00.000Z");
        expect(result.uid).toBe("e2");
    });
});

describe("resizeOccurrenceEnd", () => {
    it("resizes a non-recurring event's end time, keeping start fixed, via a plain PUT", async () => {
        const nonRecurring = occurrence({ recurrenceRule: undefined, isRecurringOccurrence: false, occurrenceKey: "e1" });
        const fetchMock = mockFetch(() => jsonResponse(200, nonRecurring));

        await resizeOccurrenceEnd(nonRecurring, new Date("2026-06-03T16:00:00.000Z"));

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/calendar-events/e1",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({ uid: "e1", version: 2, endDate: "2026-06-03T16:00:00.000Z" }),
            }),
        );
    });

    it("clamps to a 15-minute minimum duration rather than inverting start/end", async () => {
        const nonRecurring = occurrence({ recurrenceRule: undefined, isRecurringOccurrence: false, occurrenceKey: "e1" });
        const fetchMock = mockFetch(() => jsonResponse(200, nonRecurring));

        // Attempting to resize to *before* the start (15:00) must clamp to start + 15 minutes.
        await resizeOccurrenceEnd(nonRecurring, new Date("2026-06-03T14:00:00.000Z"));

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/calendar-events/e1",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({ uid: "e1", version: 2, endDate: "2026-06-03T15:15:00.000Z" }),
            }),
        );
    });

    it("detaches a recurring occurrence into its own standalone event when resized", async () => {
        const fetchMock = mockFetch((url, init) => {
            if (url === "/api/mail/calendar-events/e1" && init?.method === "PUT") return jsonResponse(200, occurrence());
            if (url === "/api/mail/calendar-events" && init?.method === "POST") return jsonResponse(200, occurrence({ uid: "e2" }));
            throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
        });

        const result = await resizeOccurrenceEnd(occurrence(), new Date("2026-06-03T16:00:00.000Z"));

        const postCall = fetchMock.mock.calls.find((c) => c[0] === "/api/mail/calendar-events" && (c[1] as RequestInit).method === "POST")!;
        const postBody = JSON.parse((postCall[1] as RequestInit).body as string);
        expect(postBody.endDate).toBe("2026-06-03T16:00:00.000Z");
        expect(postBody.startDate).toBe("2026-06-03T15:00:00.000Z"); // start unchanged
        expect(result.uid).toBe("e2");
    });
});
