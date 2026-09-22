///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Typed wrappers over `@rapidmx/videoconf-plugin`'s `/mail/video-meetings` REST surface — the owner-side
 * management endpoints only (create, read, update/cancel). The anonymous `/join/:token` endpoint a guest's
 * link resolves through is deliberately not wrapped here: it belongs to the meeting UI a guest loads, not to
 * the authenticated webmail client this library serves.
 *
 * A plugin's routes are mounted on the same server, under the same `/api` prefix, as every first-party route,
 * so there is nothing special about calling one: these go through the same `apiFetch()` (and therefore the
 * same `jwt` cookie, the same `configureApiBaseUrl()` origin and the same `ApiRequestError` failure shape) as
 * `calendarApi.ts`'s own calls. Authorization is the plugin's own: every call here is checked against the
 * meeting's owning mailbox ACL, so a caller who neither owns nor holds a grant on that mailbox gets a 403/404
 * rather than a meeting. When the plugin isn't installed at all, its routes simply aren't mounted and these
 * calls fail with a 404 `ApiRequestError` — a caller that offers video conferencing optionally must treat
 * that as "not available here" rather than as an error worth alarming the user with.
 *
 * Response bodies are typed, not runtime-validated, matching this library's convention for a plain typed
 * `apiFetch<T>()` call (see `crypto/signingProviderApi.ts`'s own note on the same choice).
 */

import { apiFetch } from "../util/api.js";

/** Whether a meeting is joinable only by its explicitly invited participants, or by anyone holding its link. */
export type VideoMeetingVisibility = "private" | "public";

export type VideoMeetingStatus = "scheduled" | "active" | "ended" | "cancelled";

/** The owner's view of a meeting. Only the fields a client actually reads are typed — the entity carries more. */
export interface VideoMeeting {
    uid: string;
    mailboxUid: string;
    title: string;
    visibility: VideoMeetingVisibility;
    status: VideoMeetingStatus;
    /** The `CalendarEvent` this meeting was minted for, when it was minted for one. */
    calendarEventUid?: string;
    startTime?: string;
    endTime?: string;
}

/** A meeting as fetched by `getVideoMeeting()` — the entity plus the organizer's own join link. */
export interface VideoMeetingDetail extends VideoMeeting {
    /** The owner's own working join link. Absent for a meeting that has none (a public meeting, or one minted
     * without an organizer link at all) and when the deployment has no public URL configured for the plugin. */
    organizerJoinUrl?: string;
}

/** One person to invite to a private meeting. */
export interface VideoMeetingInvitee {
    email: string;
    displayName?: string;
}

/** One invitee as minted by `createVideoMeeting()`, carrying that person's own personal join link. */
export interface VideoMeetingInviteeJoinInfo extends VideoMeetingInvitee {
    uid: string;
    /** Absent when the deployment has no public URL configured for the plugin. */
    joinUrl?: string;
}

export interface CreateVideoMeetingInput {
    /** The mailbox that owns the meeting — the one whose ACL every later call on it is checked against. */
    mailboxUid: string;
    /** Non-empty, at most 200 characters (the server rejects anything else with a 400). */
    title: string;
    visibility: VideoMeetingVisibility;
    /** The `CalendarEvent` this meeting is being minted for, when there is one. */
    calendarEventUid?: string;
    startTime?: string;
    endTime?: string;
    /** Required, and non-empty, for a `"private"` meeting — the server mints one personal join link per entry
     * and 400s a private meeting with none. Never send the organizer here: they reach their own meeting
     * through ownership (and `organizerJoinUrl`), not as a guest. */
    invitees?: VideoMeetingInvitee[];
}

export interface VideoMeetingCreateResult {
    meeting: VideoMeeting;
    /** Present for a private meeting — one entry per requested invitee, each with their own join link. */
    invitees?: VideoMeetingInviteeJoinInfo[];
    /** Present for a private meeting — the organizer's own join link (see `VideoMeetingDetail`). */
    organizerJoinUrl?: string;
    /** Present for a public meeting — the single link everyone joins through. */
    publicJoinUrl?: string;
}

/** Creates a meeting owned by `input.mailboxUid`. Requires CREATE on that mailbox. */
export function createVideoMeeting(input: CreateVideoMeetingInput): Promise<VideoMeetingCreateResult> {
    return apiFetch("/mail/video-meetings", { method: "POST", body: JSON.stringify(input) });
}

/**
 * The only changes this route accepts. It deliberately cannot change a meeting's invitees: a private
 * meeting's invitee list (and therefore its personal join links) is fixed at creation, so a caller whose
 * invitee list has changed must cancel this meeting and create a new one.
 */
export interface UpdateVideoMeetingInput {
    title?: string;
    status?: "cancelled";
}

/** Renames or cancels a meeting. Requires UPDATE on its owning mailbox. */
export function updateVideoMeeting(uid: string, input: UpdateVideoMeetingInput): Promise<VideoMeeting> {
    return apiFetch(`/mail/video-meetings/${encodeURIComponent(uid)}`, { method: "PUT", body: JSON.stringify(input) });
}

/** Fetches one meeting, with the organizer's own join link when it has one. Requires READ on its owning mailbox. */
export function getVideoMeeting(uid: string): Promise<VideoMeetingDetail> {
    return apiFetch(`/mail/video-meetings/${encodeURIComponent(uid)}`);
}
