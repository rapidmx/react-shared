///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Typed wrappers over `@rapidmx/restapi`'s first-run setup state (`BaseSetupRoute`, mounted at `system/setup`).
 * Trusted-admin-only: a non-admin gets a `403`, which is how the web apps know not to send them to the wizard.
 */
import { apiFetch } from "../util/api.js";

/** Mirrors `@rapidmx/restapi`'s `SetupStatus`. Dates arrive as ISO strings. */
export interface SetupStatus {
    /** Whether an administrator should be taken to the setup wizard. */
    required: boolean;
    startedAt?: string;
    completedAt?: string;
    /** The wizard step last saved with `saveSetupStep()`. */
    currentStep?: string;
}

export function getSetupStatus(): Promise<SetupStatus> {
    return apiFetch("/system/setup");
}

/** Records the step the administrator is on, so leaving and coming back resumes there. */
export function saveSetupStep(currentStep: string): Promise<SetupStatus> {
    return apiFetch("/system/setup", { method: "PUT", body: JSON.stringify({ currentStep }) });
}

export function completeSetup(): Promise<SetupStatus> {
    return apiFetch("/system/setup/complete", { method: "POST" });
}

/** Sends administrators back through the wizard from its first step. */
export function reopenSetup(): Promise<SetupStatus> {
    return apiFetch("/system/setup/reopen", { method: "POST" });
}
