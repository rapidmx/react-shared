///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * `@dnd-kit/core` identifies draggables/droppables purely by string id — this module owns the
 * encoding scheme for calendar drag ids and, more importantly, `resolveDragAction()`: a pure
 * function turning a drag-end's (active id, over id) pair into "move this occurrence by N ms" or
 * "resize this occurrence's end to this instant", *without* touching `@dnd-kit` itself. Kept pure and
 * dependency-free from the grid components on purpose: `@dnd-kit`'s pointer-based drag sensors are
 * awkward to drive from jsdom in tests (they need real `PointerEvent`/`getBoundingClientRect`
 * behavior a headless DOM doesn't fully provide), but the *decision* a drag-end makes is ordinary
 * data-in-data-out logic that's trivial to unit test directly — see `calendarDragIds.test.ts`. The
 * grid views (`MonthView`/`TimeGridView`) only need to tag their draggable/droppable elements with
 * these ids correctly; the calendar page's `onDragEnd` calls `resolveDragAction` and then one of
 * `calendarMutations.ts`'s `moveOccurrence`/`resizeOccurrenceEnd`.
 */

import { CalendarOccurrence } from "./recurrence.js";

const DAY_ID_PREFIX = "day:";
const SLOT_ID_PREFIX = "slot:";
const RESIZE_ID_PREFIX = "resize:";

/** A month-view day cell's droppable id, for the given day (any time-of-day on that calendar date). */
export function dayDropId(date: Date): string {
    return `${DAY_ID_PREFIX}${date.toISOString().slice(0, 10)}`;
}

/** A week/day-view time slot's droppable id, rounded to the given date-time instant. */
export function slotDropId(date: Date): string {
    return `${SLOT_ID_PREFIX}${date.toISOString()}`;
}

/** An event chip/block's draggable id (drag-to-move). */
export function eventDragId(occurrence: CalendarOccurrence): string {
    return occurrence.occurrenceKey;
}

/** An event block's resize-handle draggable id (drag-to-resize, week/day view only). */
export function resizeDragId(occurrence: CalendarOccurrence): string {
    return `${RESIZE_ID_PREFIX}${occurrence.occurrenceKey}`;
}

export type DragAction =
    | { type: "move"; occurrence: CalendarOccurrence; deltaMs: number }
    | { type: "resize"; occurrence: CalendarOccurrence; newEnd: Date };

/**
 * Resolves a `@dnd-kit` drag-end's `active`/`over` ids into the action it represents, or `null` if
 * the drop doesn't correspond to anything actionable (dropped outside any droppable, or the dragged
 * id doesn't match any occurrence currently on the grid — e.g. it was removed by an in-flight reload
 * mid-drag).
 */
export function resolveDragAction(
    activeId: string,
    overId: string | undefined,
    occurrences: CalendarOccurrence[],
): DragAction | null {
    if (!overId) {
        return null;
    }

    const isResize = activeId.startsWith(RESIZE_ID_PREFIX);
    const occurrenceKey = isResize ? activeId.slice(RESIZE_ID_PREFIX.length) : activeId;
    const occurrence = occurrences.find((o) => o.occurrenceKey === occurrenceKey);
    if (!occurrence) {
        return null;
    }

    if (isResize) {
        if (!overId.startsWith(SLOT_ID_PREFIX)) {
            return null;
        }
        return { type: "resize", occurrence, newEnd: new Date(overId.slice(SLOT_ID_PREFIX.length)) };
    }

    if (overId.startsWith(DAY_ID_PREFIX)) {
        const targetDay = new Date(`${overId.slice(DAY_ID_PREFIX.length)}T00:00:00.000Z`);
        const sourceDay = new Date(`${occurrence.startDate.slice(0, 10)}T00:00:00.000Z`);
        return { type: "move", occurrence, deltaMs: targetDay.getTime() - sourceDay.getTime() };
    }

    if (overId.startsWith(SLOT_ID_PREFIX)) {
        const targetSlot = new Date(overId.slice(SLOT_ID_PREFIX.length));
        return { type: "move", occurrence, deltaMs: targetSlot.getTime() - new Date(occurrence.startDate).getTime() };
    }

    return null;
}
