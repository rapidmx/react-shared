///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Typed wrappers over `@rapidmx/restapi`'s `BasePluginRoute` (mounted at `system/plugins`) - the plugins this
 * deployment runs. Every endpoint is trusted-admin-only server-side. Saving a change doesn't apply it directly:
 * each server copy installs the new plugin set and restarts itself, one copy at a time, and reports back through
 * `getPluginStatus()`.
 */
import { apiFetch } from "../util/api.js";

/** Mirrors `@rapidmx/restapi`'s `PluginSettingDefinition`. */
export interface PluginSettingDefinition {
    key: string;
    label: string;
    type: "string" | "number" | "boolean" | "select";
    help?: string;
    default?: string | number | boolean;
    required?: boolean;
    min?: number;
    max?: number;
    options?: { value: string; label: string }[];
}

/** Mirrors `@rapidmx/restapi`'s `PluginManifest`. */
export interface PluginManifest {
    apiVersion: number;
    displayName: string;
    description?: string;
    settings?: PluginSettingDefinition[];
    /** Other plugins this one needs, as package name to npm version range. */
    requires?: Record<string, string>;
    /** Whether the plugin stores per-mailbox data that data-subject erasure must reach. */
    mailboxScopedData?: boolean;
}

export type PluginSettingValue = string | number | boolean;

/** Mirrors `@rapidmx/restapi`'s `Plugin`. `version` is the row's optimistic-lock counter; the npm version is
 * `packageVersion`. */
export interface Plugin {
    uid: string;
    version: number;
    name: string;
    packageVersion: string;
    integrity?: string;
    enabled: boolean;
    settings: Record<string, PluginSettingValue>;
    manifest: PluginManifest;
}

/** Mirrors `@rapidmx/restapi`'s `RegistryPackageVersion`. `manifest` is a message when the version isn't a
 * loadable plugin. */
export interface RegistryPackageVersion {
    name: string;
    version: string;
    description?: string;
    integrity?: string;
    peerDependencies: Record<string, string>;
    manifest: PluginManifest | string;
}

export interface PluginRegistryLookup {
    package: { name: string; latest?: string; versions: string[] };
    selected: RegistryPackageVersion;
}

/** What one server copy last reported. */
export interface PluginInstanceStatus {
    instance: string;
    /** Equals `PluginStatus.hash` once the copy has applied the current plugin set. */
    hash: string;
    loaded: { name: string; version: string }[];
    errors: { name: string; message: string }[];
    safeMode: boolean;
    updatedAt: string;
}

/** Where an uninstalled plugin's data deletion stands: `pending` until no server runs the plugin, `running` while one
 * server deletes, then `done` or `failed` (retryable). */
export type PluginPurgeState = "pending" | "running" | "done" | "failed";

/** One step of a data deletion. A retry runs only the steps that failed. */
export interface PluginPurgeStep {
    /** `hook`, `data:<datastore>:<collection or table>`, `blobs`, `settings` or `files`. */
    step: string;
    ok: boolean;
    /** How many documents or rows the step deleted. */
    count?: number;
    error?: string;
    note?: string;
}

/** The deletion of an uninstalled plugin's data (`GET /status`'s `purges`). */
export interface PluginPurgeInfo {
    uid: string;
    name: string;
    displayName?: string;
    state: PluginPurgeState;
    /** The uid of the administrator who asked for it. */
    requestedBy?: string;
    /** ISO time. */
    requestedAt?: string;
    /** ISO time; set once it is `done` or `failed`. */
    completedAt?: string;
    steps: PluginPurgeStep[];
    /** Why it failed. */
    error?: string;
    /** While `pending`: how many servers still run the plugin (or haven't applied its removal), of how many report. */
    serversRunning?: number;
    serversTotal?: number;
}

export interface PluginStatus {
    /** The fingerprint of the saved plugin set every copy should reach. */
    hash: string;
    instances: PluginInstanceStatus[];
    /** Each uninstalled plugin whose data was asked to be deleted. Absent from an older server. */
    purges?: PluginPurgeInfo[];
}

/** A plugin package found by `searchPlugins()`. `version` is its latest published version. */
export interface PluginSearchResult {
    name: string;
    version: string;
    description?: string;
    date?: string;
    /** Whether this server's configuration lets an administrator add it. */
    allowed: boolean;
    /** Set when the package is already installed. */
    installedUid?: string;
    installedVersion?: string;
    /** Whether `version` is newer than the installed version. */
    updateAvailable: boolean;
}

/** An installed plugin's latest published version, from `getPluginUpdates()`. */
export interface PluginUpdateInfo {
    uid: string;
    name: string;
    installedVersion: string;
    latestVersion?: string;
    updateAvailable: boolean;
    /** Whether this server's configuration still allows the package; an update is never offered when it doesn't. */
    allowed?: boolean;
    /** Why the registry couldn't be checked for this plugin. */
    error?: string;
}

/** A namespace (npm scope) this server searches for plugins. */
export interface PluginNamespace {
    name: string;
    registry?: string;
}

/** What `planPluginChange()` found: dependencies that would be installed (dependencies first) and installed plugins
 * that would be enabled. The change is refused while `conflicts` isn't empty. */
export interface PluginChangePlan {
    plugin: { name: string; version: string; manifest: PluginManifest };
    install: { name: string; version: string; integrity?: string; manifest: PluginManifest }[];
    enable: string[];
    conflicts: string[];
}

/** `addPlugin()`'s result: the added plugin and the dependencies installed or enabled with it. */
export interface AddPluginResult {
    plugin: Plugin;
    dependencies: Plugin[];
    /** The plugins whose pending data deletion adding this cancelled (the plugin itself, and any it requires). */
    purgeCancelled?: string[];
    /** Things worth telling the administrator, such as a cancelled data deletion. */
    warnings?: string[];
}

/** What uninstalling a plugin did. */
export interface RemovePluginResult {
    /** Whether the plugin's data will be deleted once no server runs the plugin any more. */
    purgeScheduled: boolean;
    purge?: PluginPurgeInfo;
}

/** The other plugins a previewed change was confirmed to install and enable (from its `PluginChangePlan`). The server
 * refuses the change (409) when what it would do now differs, e.g. because a new dependency appeared since. Send empty
 * lists to require that nothing else is installed or enabled. */
export interface PluginExpectedPlan {
    /** The version of the plugin itself that was previewed. */
    version?: string;
    install: { name: string; version: string }[];
    enable: string[];
}

/** The `expectedPlan` to send for a change previewed as `plan`. */
export function expectedPlanOf(plan: Pick<PluginChangePlan, "install" | "enable"> & { plugin?: { version: string } }): PluginExpectedPlan {
    return {
        ...(plan.plugin ? { version: plan.plugin.version } : {}),
        install: plan.install.map(({ name, version }) => ({ name, version })),
        enable: [...plan.enable],
    };
}

export interface UpdatePluginInput {
    /** The row's optimistic-lock counter. */
    version?: number;
    packageVersion?: string;
    enabled?: boolean;
    /** A `null` value clears a setting back to the plugin's own default. */
    settings?: Record<string, PluginSettingValue | null>;
    /** What a previewed version change or enable was confirmed to also install and enable. */
    expectedPlan?: PluginExpectedPlan;
}

const BASE = "/system/plugins";

export function listPlugins(): Promise<Plugin[]> {
    return apiFetch(BASE);
}

export function getPluginStatus(): Promise<PluginStatus> {
    return apiFetch(`${BASE}/status`);
}

/** The namespaces this server searches for plugins. */
export function listPluginNamespaces(): Promise<PluginNamespace[]> {
    return apiFetch(`${BASE}/namespaces`);
}

/** Plugin packages (named `*-plugin`) in `namespace`, or in every configured namespace when it's omitted. */
export function searchPlugins(namespace?: string): Promise<PluginSearchResult[]> {
    const query = namespace ? `?namespace=${encodeURIComponent(namespace)}` : "";
    return apiFetch(`${BASE}/search${query}`);
}

/** Each installed plugin's latest published version. */
export function getPluginUpdates(): Promise<PluginUpdateInfo[]> {
    return apiFetch(`${BASE}/updates`);
}

/**
 * A package's published versions and one version's manifest (the latest, unless `packageVersion` is given). The name
 * goes in the query string: a scoped name in the path needs its `/` escaped as `%2F`, which a proxy in front of the
 * server (Envoy Gateway's default) unescapes and redirects to a path that matches no route.
 */
export function lookupPluginPackage(name: string, packageVersion?: string): Promise<PluginRegistryLookup> {
    const query = new URLSearchParams({ name });
    if (packageVersion) {
        query.set("packageVersion", packageVersion);
    }
    return apiFetch(`${BASE}/registry?${query.toString()}`);
}

/** What adding `name` - or changing it, when installed - at `packageVersion` (default: latest) would also install and
 * enable, and what would refuse it. Nothing is changed. */
export function planPluginChange(name: string, packageVersion?: string): Promise<PluginChangePlan> {
    const query = new URLSearchParams({ name });
    if (packageVersion) {
        query.set("packageVersion", packageVersion);
    }
    return apiFetch(`${BASE}/plan?${query.toString()}`);
}

/** Adds a plugin, at its latest version unless `packageVersion` is given, installing and enabling the plugins it
 * requires first. Refused (409) when a requirement conflicts with an installed plugin's version, or when
 * `expectedPlan` is given and no longer matches what adding it would install and enable. */
export function addPlugin(name: string, packageVersion?: string, expectedPlan?: PluginExpectedPlan): Promise<AddPluginResult> {
    return apiFetch(BASE, { method: "POST", body: JSON.stringify({ name, packageVersion, expectedPlan }) });
}

export function updatePlugin(uid: string, input: UpdatePluginInput): Promise<Plugin> {
    return apiFetch(`${BASE}/${encodeURIComponent(uid)}`, { method: "PUT", body: JSON.stringify(input) });
}

/**
 * Removes a plugin. Refused (409) while an enabled plugin requires it, as is disabling it with `updatePlugin()`.
 *
 * By default the data it stored stays in the database. With `purgeData` it is also deleted - its collections and tables,
 * saved settings and files - once no server runs the plugin any more (see `PluginStatus.purges`); that can't be undone,
 * and the server only accepts it from an elevated administrator (403 `api-104` otherwise). Adding the plugin again before
 * the deletion starts cancels it.
 */
export async function removePlugin(uid: string, options: { purgeData?: boolean } = {}): Promise<RemovePluginResult> {
    const result = await apiFetch<RemovePluginResult | undefined>(`${BASE}/${encodeURIComponent(uid)}`, {
        method: "DELETE",
        // Nothing is sent unless asked for, so a server that doesn't know the flag is called exactly as before.
        ...(options.purgeData ? { body: JSON.stringify({ purgeData: true }) } : {}),
    });
    return result ?? { purgeScheduled: false };
}

/** Runs the steps of a failed data deletion that failed again. Needs an elevated administrator. */
export function retryPluginPurge(purgeUid: string): Promise<PluginPurgeInfo> {
    return apiFetch(`${BASE}/purges/${encodeURIComponent(purgeUid)}/retry`, { method: "POST" });
}
