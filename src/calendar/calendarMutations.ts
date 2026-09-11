///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Higher-level calendar mutations shared by the event modal (edit/delete) and the grid views'
 * drag-and-drop handlers (move/resize) — both need the exact same "this occurrence vs. the entire
 * series" logic for a recurring event, so it lives here once rather than being duplicated.
 *
 * A recurring event has no per-occurrence record server-side — `@rapidmx/restapi` stores only the
 * master `CalendarEvent` plus its `RecurrenceRule` (see `recurrence.ts`'s header comment). Changing
 * (or deleting) a single occurrence is therefore always a two-part operation: add that occurrence's
 * original start to the master's `recurrenceRule.exceptions` (so it stops being generated), and, for
 * an edit (not a delete), separately create a new standalone `CalendarEvent` carrying the edited
 * fields, with `recurrenceId` set to that original occurrence's start for traceability — mirroring
 * how `CalendarEvent.recurrenceId` is documented to work.
 */

import { CalendarEvent, CalendarEventInput, createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from "./calendarApi.js";
import { CalendarOccurrence } from "./recurrence.js";

function addException(event: CalendarEvent, occurrenceStart: string): Promise<CalendarEvent> {
    const rule = event.recurrenceRule!;
    return updateCalendarEvent({
        uid: event.uid,
        version: event.version,
        recurrenceRule: { ...rule, exceptions: [...rule.exceptions, occurrenceStart] },
    });
}

/** Applies edited `fields` to every occurrence of a recurring event's series (the master record). */
export function saveEventSeries(occurrence: CalendarOccurrence, fields: Partial<CalendarEventInput>): Promise<CalendarEvent> {
    return updateCalendarEvent({ uid: occurrence.uid, version: occurrence.version, ...fields });
}

/**
 * Applies edited `fields` to just this one occurrence of a recurring event, detaching it into its own
 * standalone (non-recurring) event and excluding the original occurrence from the series.
 */
export async function detachOccurrence(occurrence: CalendarOccurrence, fields: Partial<CalendarEventInput>): Promise<CalendarEvent> {
    await addException(occurrence, occurrence.recurrenceId!);
    return createCalendarEvent({
        mailboxUid: occurrence.mailboxUid,
        folderUid: occurrence.folderUid,
        title: occurrence.title,
        location: occurrence.location,
        startDate: occurrence.startDate,
        endDate: occurrence.endDate,
        allDay: occurrence.allDay,
        timezone: occurrence.timezone,
        organizer: occurrence.organizer,
        attendees: occurrence.attendees,
        status: occurrence.status,
        busyStatus: occurrence.busyStatus,
        reminderMinutesBeforeStart: occurrence.reminderMinutesBeforeStart,
        ...fields,
    });
}

/** Deletes an entire recurring series (or a genuinely non-recurring event) outright. */
export function deleteEventSeries(occurrence: CalendarOccurrence): Promise<void> {
    return deleteCalendarEvent(occurrence.uid, occurrence.version);
}

/** Removes just this one occurrence from a recurring series, leaving the rest of the series intact. */
export function deleteEventOccurrence(occurrence: CalendarOccurrence): Promise<CalendarEvent> {
    return addException(occurrence, occurrence.recurrenceId!);
}

/**
 * Moves `occurrence` by `deltaMs` (drag-to-move on a grid), preserving its original duration. A
 * recurring occurrence is always detached into its own standalone event — matching Outlook's own
 * drag behavior, which never silently reschedules an entire series from a single dragged instance;
 * moving the whole series is only ever done explicitly, via the event modal's "entire series" option.
 */
export function moveOccurrence(occurrence: CalendarOccurrence, deltaMs: number): Promise<CalendarEvent> {
    const fields = {
        startDate: new Date(new Date(occurrence.startDate).getTime() + deltaMs).toISOString(),
        endDate: new Date(new Date(occurrence.endDate).getTime() + deltaMs).toISOString(),
    };
    return occurrence.isRecurringOccurrence
        ? detachOccurrence(occurrence, fields)
        : updateCalendarEvent({ uid: occurrence.uid, version: occurrence.version, ...fields });
}

/**
 * Resizes `occurrence`'s end time (drag-to-resize on a week/day grid), keeping its start fixed and
 * clamping to a 15-minute minimum duration so a resize can never invert start/end. Same
 * always-detaches-a-recurring-occurrence reasoning as `moveOccurrence` above.
 */
export function resizeOccurrenceEnd(occurrence: CalendarOccurrence, newEndDate: Date): Promise<CalendarEvent> {
    const start = new Date(occurrence.startDate);
    const minEnd = new Date(start.getTime() + 15 * 60_000);
    const endDate = (newEndDate.getTime() > minEnd.getTime() ? newEndDate : minEnd).toISOString();
    return occurrence.isRecurringOccurrence
        ? detachOccurrence(occurrence, { endDate })
        : updateCalendarEvent({ uid: occurrence.uid, version: occurrence.version, endDate });
}
