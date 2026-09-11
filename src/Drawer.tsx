///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface DrawerProps {
    open: boolean;
    onClose: () => void;
    title: string;
    /** Which edge the drawer slides in from. Defaults to "left" (matches every current call site — a
     * secondary sidebar or nav list). */
    side?: "left" | "right";
    children: ReactNode;
}

/**
 * An off-canvas panel for mobile, portal-rendered to `document.body` like `Modal.tsx` — same
 * backdrop/focus-trap/Escape-key contract, copied verbatim, just styled as a slide-in edge panel
 * instead of a centered card. Used to hold a secondary sidebar's content below the `md` breakpoint,
 * where it doesn't fit alongside the primary content.
 */
export default function Drawer({ open, onClose, title, side = "left", children }: DrawerProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<Element | null>(null);
    // Callers routinely pass `onClose` as a fresh inline function every render — reading it through a ref
    // (rather than depending on it directly) keeps the effect below from re-running, and re-stealing focus
    // into the drawer, on every parent re-render.
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!open) return;

        triggerRef.current = document.activeElement;
        dialogRef.current?.focus();

        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") {
                onCloseRef.current();
            }
        }
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            if (triggerRef.current instanceof HTMLElement) {
                triggerRef.current.focus();
            }
        };
    }, [open]);

    if (!open) {
        return null;
    }

    return createPortal(
        <div
            className="fixed inset-0 bg-black/50 z-[1000]"
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                className={[
                    "fixed inset-y-0 w-72 max-w-[85vw] overflow-y-auto bg-surface border-border shadow-modal p-5 focus:outline-none",
                    side === "left" ? "left-0 border-r" : "right-0 border-l",
                ].join(" ")}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                ref={dialogRef}
            >
                <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="text-xl font-bold tracking-tight">{title}</div>
                    <button
                        type="button"
                        className="bg-transparent border-none text-text-muted text-2xl leading-none cursor-pointer p-0 hover:text-text"
                        aria-label="Close"
                        onClick={onClose}
                    >
                        &times;
                    </button>
                </div>
                <div>{children}</div>
            </div>
        </div>,
        document.body,
    );
}
