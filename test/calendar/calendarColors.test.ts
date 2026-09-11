///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { describe, it, expect } from "vitest";
import { CALENDAR_COLOR_PALETTE, DEFAULT_CALENDAR_COLOR, colorForFolder } from "../../src/calendar/calendarColors.js";

describe("colorForFolder", () => {
    it("returns the folder's own color when set", () => {
        expect(colorForFolder({ color: "#16a34a" })).toBe("#16a34a");
    });

    it("falls back to DEFAULT_CALENDAR_COLOR when the folder has no color", () => {
        expect(colorForFolder({ color: undefined })).toBe(DEFAULT_CALENDAR_COLOR);
    });

    it("falls back to DEFAULT_CALENDAR_COLOR when the folder's color is an empty string", () => {
        expect(colorForFolder({ color: "" })).toBe(DEFAULT_CALENDAR_COLOR);
    });

    it("DEFAULT_CALENDAR_COLOR is the palette's first entry", () => {
        expect(DEFAULT_CALENDAR_COLOR).toBe(CALENDAR_COLOR_PALETTE[0]);
    });
});
