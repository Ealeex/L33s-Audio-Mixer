import Runtime from "./Runtime";

const siteOverridesKey = "site-enabled-overrides";
const disabledByDefault = ["spotify.com"];

type SiteOverrides = Record<string, boolean>;

function normalizeHostname(hostname: string): string {
    return hostname.trim().toLowerCase().replace(/^www\./, "");
}

function isDisabledByDefault(hostname: string): boolean {
    return disabledByDefault.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
}

export async function isSiteEnabled(hostname: string): Promise<boolean> {
    const normalized = normalizeHostname(hostname);
    if (!normalized) return false;
    const result = await Runtime.storage.local.get(siteOverridesKey);
    const overrides = result[siteOverridesKey];
    if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
        const override = (overrides as SiteOverrides)[normalized];
        if (typeof override === "boolean") return override;
    }
    return !isDisabledByDefault(normalized);
}

export async function setSiteEnabled(hostname: string, enabled: boolean): Promise<void> {
    const normalized = normalizeHostname(hostname);
    if (!normalized) return;
    const result = await Runtime.storage.local.get(siteOverridesKey);
    const stored = result[siteOverridesKey];
    const overrides: SiteOverrides = stored && typeof stored === "object" && !Array.isArray(stored)
        ? { ...stored as SiteOverrides }
        : {};
    overrides[normalized] = enabled;
    await Runtime.storage.local.set({ [siteOverridesKey]: overrides });
}
