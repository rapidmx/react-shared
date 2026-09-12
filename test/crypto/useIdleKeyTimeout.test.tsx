// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { destroyUnlockedKeys } = vi.hoisted(() => ({ destroyUnlockedKeys: vi.fn() }));
vi.mock("../../src/crypto/keySession.js", () => ({ destroyUnlockedKeys }));

const { getIdleTimeoutMinutes } = vi.hoisted(() => ({ getIdleTimeoutMinutes: vi.fn() }));
vi.mock("../../src/crypto/idleTimeout.js", () => ({ getIdleTimeoutMinutes }));

import { useIdleKeyTimeout } from "../../src/crypto/useIdleKeyTimeout.js";

function Harness() {
    useIdleKeyTimeout();
    return null;
}

afterEach(() => {
    vi.useRealTimers();
    destroyUnlockedKeys.mockReset();
    getIdleTimeoutMinutes.mockReset();
});

describe("useIdleKeyTimeout", () => {
    it("destroys unlocked keys after the configured idle period with no activity", () => {
        vi.useFakeTimers();
        getIdleTimeoutMinutes.mockReturnValue(5);
        render(<Harness />);

        vi.advanceTimersByTime(5 * 60_000 - 1);
        expect(destroyUnlockedKeys).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(destroyUnlockedKeys).toHaveBeenCalledTimes(1);
        expect(destroyUnlockedKeys).toHaveBeenCalledWith();
    });

    it("resets the timer on mousedown/keydown activity, so it never fires while the user keeps interacting", () => {
        vi.useFakeTimers();
        getIdleTimeoutMinutes.mockReturnValue(5);
        render(<Harness />);

        vi.advanceTimersByTime(4 * 60_000);
        document.dispatchEvent(new Event("mousedown"));
        vi.advanceTimersByTime(4 * 60_000);
        document.dispatchEvent(new Event("keydown"));
        vi.advanceTimersByTime(4 * 60_000);
        expect(destroyUnlockedKeys).not.toHaveBeenCalled();

        vi.advanceTimersByTime(60_000 + 1);
        expect(destroyUnlockedKeys).toHaveBeenCalledTimes(1);
    });

    it("resets on scroll and touchstart too", () => {
        vi.useFakeTimers();
        getIdleTimeoutMinutes.mockReturnValue(5);
        render(<Harness />);

        vi.advanceTimersByTime(4 * 60_000);
        document.dispatchEvent(new Event("scroll"));
        vi.advanceTimersByTime(4 * 60_000);
        document.dispatchEvent(new Event("touchstart"));
        vi.advanceTimersByTime(4 * 60_000);
        expect(destroyUnlockedKeys).not.toHaveBeenCalled();
    });

    it("does nothing at all when the configured timeout is 0 (disabled)", () => {
        vi.useFakeTimers();
        getIdleTimeoutMinutes.mockReturnValue(0);
        render(<Harness />);

        vi.advanceTimersByTime(365 * 24 * 60 * 60_000);
        expect(destroyUnlockedKeys).not.toHaveBeenCalled();
    });

    it("stops listening and clears its pending timer after unmount", () => {
        vi.useFakeTimers();
        getIdleTimeoutMinutes.mockReturnValue(5);
        const { unmount } = render(<Harness />);
        unmount();

        vi.advanceTimersByTime(10 * 60_000);
        expect(destroyUnlockedKeys).not.toHaveBeenCalled();
    });
});
