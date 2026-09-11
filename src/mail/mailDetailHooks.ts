///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { useEffect, useState } from "react";
import { Attachment, Message, listAttachments, setMessageRead } from "./mailApi.js";

/** Loads a message's attachments (only when it actually has any) — shared by every place a message is read. */
export function useMessageAttachments(message: Message | null): Attachment[] {
    const [attachments, setAttachments] = useState<Attachment[]>([]);

    useEffect(() => {
        if (!message || !message.hasAttachments) {
            setAttachments([]);
            return;
        }
        listAttachments(message.folderUid, message.uid)
            .then(setAttachments)
            .catch(() => setAttachments([]));
    }, [message]);

    return attachments;
}

/**
 * Marks a message read the first time it's viewed. `onUpdated` receives the server's updated copy — the
 * desktop reading pane patches its in-memory message list with it; the mobile detail route (which has no
 * list to patch) just replaces its own local `message` state. Best-effort: a failed update shouldn't block
 * reading the message, matching this app's existing `handleSelect` behavior.
 */
export function useMarkMessageRead(message: Message | null, onUpdated: (updated: Message) => void): void {
    useEffect(() => {
        if (!message || message.flags.read) {
            return;
        }
        let cancelled = false;
        setMessageRead(message, true)
            .then((updated) => {
                if (!cancelled) {
                    onUpdated(updated);
                }
            })
            .catch(() => {
                // Best-effort — see doc comment above.
            });
        return () => {
            cancelled = true;
        };
    }, [message]);
}
