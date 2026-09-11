// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HiOutlineCalendarDays, HiOutlineClipboardDocumentList, HiOutlineEnvelope, HiOutlineUsers } from "react-icons/hi2";
import BottomTabBar, { NavItem } from "../../../src/components/navigation/BottomTabBar.js";

// A stand-in for a real app's own nav-item list - `BottomTabBar` is deliberately agnostic to any one
// consumer's app set (see its own doc comment), so this test doesn't reach into a consumer app for one.
const APPS: NavItem[] = [
    { id: "mail", href: "/", label: "Mail", icon: HiOutlineEnvelope },
    { id: "calendar", href: "/calendar", label: "Calendar", icon: HiOutlineCalendarDays },
    { id: "contacts", href: "/contacts", label: "Contacts", icon: HiOutlineUsers },
    { id: "tasks", href: "/tasks", label: "Tasks", icon: HiOutlineClipboardDocumentList },
];

describe("BottomTabBar", () => {
    it("renders a link for every app, using the shared APPS data", () => {
        render(<BottomTabBar apps={APPS} active="mail" />);

        for (const app of APPS) {
            const link = screen.getByRole("link", { name: app.label });
            expect(link).toHaveAttribute("href", app.href);
        }
    });

    it("marks only the active app's link with aria-current", () => {
        render(<BottomTabBar apps={APPS} active="calendar" />);

        expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("link", { name: "Mail" })).not.toHaveAttribute("aria-current");
        expect(screen.getByRole("link", { name: "Contacts" })).not.toHaveAttribute("aria-current");
        expect(screen.getByRole("link", { name: "Tasks" })).not.toHaveAttribute("aria-current");
    });

    it("is hidden at md and above, and only shown below it", () => {
        render(<BottomTabBar apps={APPS} active="mail" />);
        expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toHaveClass("md:hidden");
    });
});
