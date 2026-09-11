///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/** A fixed client-side color palette for calendars, matching the plan's "no new `Category`-style
 * backend entity" approach already used for Contacts' categories: `Folder.color` just stores one of
 * these hex values (or, in principle, any string — an unrecognized one still works fine as a raw CSS
 * color), the palette itself never needs to round-trip through the backend. */

import { Folder } from "./mailApi.js";

export const CALENDAR_COLOR_PALETTE: string[] = [
    "#2563eb", // blue
    "#7c3aed", // violet
    "#db2777", // pink
    "#dc2626", // red
    "#ea580c", // orange
    "#ca8a04", // amber
    "#16a34a", // green
    "#0d9488", // teal
];

/** The color a mailbox's original auto-provisioned calendar effectively had before this field
 * existed — kept as the fallback so every pre-existing calendar keeps looking the same. */
export const DEFAULT_CALENDAR_COLOR = CALENDAR_COLOR_PALETTE[0];

export function colorForFolder(folder: Pick<Folder, "color">): string {
    return folder.color || DEFAULT_CALENDAR_COLOR;
}
