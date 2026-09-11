///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface ModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
}

/**
 * A small, dependency-free modal dialog rendered via a portal to `document.body`. Controlled by the
 * caller (`open` state lives in the parent, not here) so multiple call sites can share the same simple
 * contract without each needing its own open/close plumbing.
 */
export default function Modal({ open, onClose, title, children }: ModalProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<Element | null>(null);
    // Callers routinely pass `onClose` as a fresh inline function every render — reading it through a ref
    // (rather than depending on it directly) keeps the effect below from re-running, and re-stealing focus
    // into the dialog, on every parent re-render (e.g. every keystroke in a field inside the modal).
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!open) return;

        // Remember what had focus before the modal opened so it can be restored on close (e.g. the "+
        // Add" button that triggered this modal), then move focus into the dialog itself.
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
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-5 z-[1000]"
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                className="w-full max-w-[440px] max-h-[calc(100vh-2.5rem)] overflow-y-auto bg-surface border border-border rounded-md shadow-modal p-7 focus:outline-none"
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
