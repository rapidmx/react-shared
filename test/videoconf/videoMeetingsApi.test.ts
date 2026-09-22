///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../testUtils.js";
import { createVideoMeeting, getVideoMeeting, updateVideoMeeting } from "../../src/videoconf/videoMeetingsApi.js";

const meeting = {
    uid: "vm1",
    mailboxUid: "mb1",
    title: "Standup",
    visibility: "private" as const,
    status: "scheduled" as const,
    calendarEventUid: "e1",
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("createVideoMeeting", () => {
    it("POSTs the input and returns the meeting with its invitee and organizer join links", async () => {
        const created = {
            meeting,
            invitees: [{ uid: "i1", email: "bob@example.com", displayName: "Bob", joinUrl: "https://meet.example.com/tok-bob" }],
            organizerJoinUrl: "https://meet.example.com/tok-org",
        };
        const fetchMock = mockFetch(() => jsonResponse(200, created));
        const input = {
            mailboxUid: "mb1",
            title: "Standup",
            visibility: "private" as const,
            calendarEventUid: "e1",
            startTime: "2026-01-05T09:00:00.000Z",
            endTime: "2026-01-05T09:30:00.000Z",
            invitees: [{ email: "bob@example.com", displayName: "Bob" }],
        };
        const result = await createVideoMeeting(input);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/video-meetings",
            expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
        );
        expect(result).toEqual(created);
    });

    it("rejects with the server's own message when a private meeting has no invitees", async () => {
        mockFetch(() => jsonResponse(400, { message: "'invitees' must name at least one person.", code: "api-400" }));
        await expect(
            createVideoMeeting({ mailboxUid: "mb1", title: "Standup", visibility: "private", invitees: [] }),
        ).rejects.toMatchObject({ message: "'invitees' must name at least one person.", status: 400, code: "api-400" });
    });
});

describe("updateVideoMeeting", () => {
    it("PUTs a cancellation to the encoded uid", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ...meeting, status: "cancelled" }));
        const result = await updateVideoMeeting("vm/1", { status: "cancelled" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/video-meetings/vm%2F1",
            expect.objectContaining({ method: "PUT", body: JSON.stringify({ status: "cancelled" }) }),
        );
        expect(result.status).toBe("cancelled");
    });

    it("PUTs a new title", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ...meeting, title: "Renamed" }));
        await updateVideoMeeting("vm1", { title: "Renamed" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/video-meetings/vm1",
            expect.objectContaining({ method: "PUT", body: JSON.stringify({ title: "Renamed" }) }),
        );
    });

    it("rejects when the caller no longer owns the meeting", async () => {
        mockFetch(() => jsonResponse(403, { message: "Forbidden.", code: "api-103" }));
        await expect(updateVideoMeeting("vm1", { status: "cancelled" })).rejects.toMatchObject({ status: 403, code: "api-103" });
    });
});

describe("getVideoMeeting", () => {
    it("GETs the encoded uid and returns the organizer's own join link with the meeting", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ...meeting, organizerJoinUrl: "https://meet.example.com/tok-org" }));
        const result = await getVideoMeeting("vm/1");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/video-meetings/vm%2F1", expect.anything());
        expect(result.organizerJoinUrl).toBe("https://meet.example.com/tok-org");
    });

    it("rejects with a 404 when the plugin isn't installed (its routes aren't mounted at all)", async () => {
        mockFetch(() => jsonResponse(404, { message: "Not found." }));
        await expect(getVideoMeeting("vm1")).rejects.toMatchObject({ status: 404 });
    });
});
