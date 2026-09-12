///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Destroys every unlocked mailbox's in-memory keys after this device's configured idle period
 * (`idleTimeout.ts`) with no user activity — `specs/end-to-end_encryption.md`'s "destroyed on ...
 * a configurable idle period" trigger for `keySession.ts`'s `destroyUnlockedKeys()`.
 *
 * Listened at the `document` level (not scoped to any one app's own content area) specifically so
 * activity in *any* app — Contacts, Calendar, Tasks, not just Mail/Settings, where the unlocked keys
 * are actually read/used — resets the clock. A user reading a long document in Tasks for 40 minutes
 * without touching Mail again is still an actively-attended device, not an idle one; scoping this to
 * only the app(s) that touch key material would time it out from underneath a session that was never
 * actually unattended.
 */
import { useEffect } from "react";
import { destroyUnlockedKeys } from "./keySession.js";
import { getIdleTimeoutMinutes } from "./idleTimeout.js";

const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart"] as const;

/**
 * Safe to mount unconditionally, even before any mailbox has been unlocked this session -
 * `destroyUnlockedKeys()` is a no-op against an empty session store, so an idle period elapsing with
 * nothing unlocked yet has no observable effect. Reads the configured duration once, at mount - the
 * host component (`AppShell.tsx`) remounts on every navigation in this framework's own no-client-
 * router design (see that component's own doc comment), so a preference change made on the Settings
 * page takes effect the next time the user goes anywhere, without needing this hook to poll for
 * changes itself.
 */
export function useIdleKeyTimeout(): void {
    useEffect(() => {
        const minutes = getIdleTimeoutMinutes();
        if (!minutes) {
            return;
        }
        const timeoutMs = minutes * 60_000;
        let timer: ReturnType<typeof setTimeout>;

        function reset() {
            clearTimeout(timer);
            timer = setTimeout(() => destroyUnlockedKeys(), timeoutMs);
        }

        reset();
        for (const event of ACTIVITY_EVENTS) {
            document.addEventListener(event, reset, { passive: true });
        }
        return () => {
            clearTimeout(timer);
            for (const event of ACTIVITY_EVENTS) {
                document.removeEventListener(event, reset);
            }
        };
    }, []);
}
