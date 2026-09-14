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

export interface PluginStatus {
    /** The fingerprint of the saved plugin set every copy should reach. */
    hash: string;
    instances: PluginInstanceStatus[];
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
}

/** The other plugins a previewed change was confirmed to install and enable (from its `PluginChangePlan`). The server
 * refuses the change (409) when what it would do now differs, e.g. because a new dependency appeared since. Send empty
 * lists to require that nothing else is installed or enabled. */
export interface PluginExpectedPlan {
    install: { name: string; version: string }[];
    enable: string[];
}

/** The `expectedPlan` to send for a change previewed as `plan`. */
export function expectedPlanOf(plan: Pick<PluginChangePlan, "install" | "enable">): PluginExpectedPlan {
    return { install: plan.install.map(({ name, version }) => ({ name, version })), enable: [...plan.enable] };
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

/** A package's published versions and one version's manifest (the latest, unless `packageVersion` is given). */
export function lookupPluginPackage(name: string, packageVersion?: string): Promise<PluginRegistryLookup> {
    const query = packageVersion ? `?packageVersion=${encodeURIComponent(packageVersion)}` : "";
    return apiFetch(`${BASE}/registry/${encodeURIComponent(name)}${query}`);
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

/** Removes a plugin. Data it stored stays in the database. Refused (409) while an enabled plugin requires it, as is
 * disabling it with `updatePlugin()`. */
export function removePlugin(uid: string): Promise<void> {
    return apiFetch(`${BASE}/${encodeURIComponent(uid)}`, { method: "DELETE" });
}
