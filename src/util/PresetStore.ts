import { Config, Preset } from "../Config";
import Runtime from "./Runtime";
import { Logger } from "./Logger";
import { createLogSpacedBands, getEqualizerBands, getEqualizerConfig, getEqualizerQs, validateEqualizerBands } from "./EqualizerSettings";

const userPresetsKey = "user-presets";
const selectedPresetKey = "selected-preset";

export type PresetCollection = Record<string, Preset>;
type SharedPreset = { format: "l33-audio-preset"; version: 1; name: string; preset: Preset };

function isPreset(value: unknown): value is Preset {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<Preset>;
    const rawQ = (value as { q?: unknown }).q;
    return typeof candidate.convolver === "number"
        && Number.isFinite(candidate.convolver)
        && typeof candidate.stereoWidener === "number"
        && Number.isFinite(candidate.stereoWidener)
        && (candidate.offset === undefined || (typeof candidate.offset === "number" && Number.isFinite(candidate.offset)))
        && (rawQ === undefined
            || (typeof rawQ === "number" && rawQ >= .3 && rawQ <= 4)
            || (Array.isArray(rawQ) && rawQ.every(q => typeof q === "number" && q >= .3 && q <= 4)))
        && (candidate.shelfEndpoints === undefined || typeof candidate.shelfEndpoints === "boolean")
        && Array.isArray(candidate.equalizer)
        && candidate.equalizer.length >= Config.MIN_EQ_BANDS
        && candidate.equalizer.length <= Config.MAX_EQ_BANDS
        && (candidate.bands === undefined
            || (Array.isArray(candidate.bands) && candidate.bands.length === candidate.equalizer.length))
        && candidate.equalizer.every(gain => typeof gain === "number" && Number.isFinite(gain));
}

function normalizePreset(preset: Preset): Preset {
    let sourceBands: number[] = Config.EQ_BANDS;
    if (preset.bands) {
        try { sourceBands = validateEqualizerBands(preset.bands); } catch {}
    } else if (preset.equalizer.length !== Config.EQ_BANDS.length) {
        sourceBands = createLogSpacedBands(preset.equalizer.length);
    }
    const rawQ = (preset as Preset & { q: number[] | number }).q;
    const q = Array.isArray(rawQ) && rawQ.length === sourceBands.length
        ? rawQ
        : Array(sourceBands.length).fill(typeof rawQ === "number" ? rawQ : 1);
    return {
        convolver: preset.convolver,
        stereoWidener: preset.stereoWidener,
        offset: preset.offset ?? 0,
        equalizer: [...preset.equalizer],
        bands: [...sourceBands],
        q: [...q],
        shelfEndpoints: preset.shelfEndpoints !== false
    };
}

export function serializePreset(name: string, preset: Preset): string {
    const payload: SharedPreset = {
        format: "l33-audio-preset",
        version: 1,
        name: name === "Custom" ? "Imported preset" : name,
        preset: normalizePreset(preset)
    };
    return JSON.stringify(payload);
}

export function parsePreset(text: string): { name: string; preset: Preset } {
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new Error("Clipboard does not contain a valid preset."); }
    if (!value || typeof value !== "object") throw new Error("Clipboard does not contain a valid preset.");
    const payload = value as Partial<SharedPreset>;
    if (payload.format !== "l33-audio-preset" || payload.version !== 1 || !isPreset(payload.preset)) {
        throw new Error("Clipboard preset format is not supported.");
    }
    const name = typeof payload.name === "string" && payload.name.trim()
        ? payload.name.trim().slice(0, 40)
        : "Imported preset";
    return { name, preset: normalizePreset(payload.preset) };
}

export async function getPresets(): Promise<PresetCollection> {
    const result = await Runtime.storage.local.get(userPresetsKey);
    const saved = result[userPresetsKey];
    const custom: PresetCollection = {};
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        for (const [name, preset] of Object.entries(saved)) {
            if (name.trim() && !Object.hasOwn(Config.Presets, name) && isPreset(preset)) {
                custom[name] = normalizePreset(preset);
            }
        }
    }
    return {
        ...Object.fromEntries(Object.entries(Config.Presets).map(([name, preset]) => [name, normalizePreset(preset)])),
        ...custom
    };
}

export async function savePreset(name: string, preset: Preset): Promise<string> {
    const normalizedName = name.trim();
    if (!normalizedName || normalizedName.length > 40) {
        throw new Error("Preset names must contain 1 to 40 characters.");
    }
    if (Object.hasOwn(Config.Presets, normalizedName)) {
        throw new Error("That name is reserved for a built-in preset.");
    }
    if (!isPreset(preset)) throw new Error("Preset values are invalid.");

    const result = await Runtime.storage.local.get(userPresetsKey);
    const stored = result[userPresetsKey];
    const custom = stored && typeof stored === "object" && !Array.isArray(stored)
        ? stored as PresetCollection
        : {};
    await Runtime.storage.local.set({
        [userPresetsKey]: { ...custom, [normalizedName]: preset }
    });
    return normalizedName;
}

export async function deletePreset(name: string): Promise<void> {
    if (Object.hasOwn(Config.Presets, name)) {
        throw new Error("Built-in presets cannot be deleted.");
    }
    const result = await Runtime.storage.local.get(userPresetsKey);
    const stored = result[userPresetsKey];
    const custom = stored && typeof stored === "object" && !Array.isArray(stored)
        ? { ...stored as PresetCollection }
        : {};
    if (!Object.hasOwn(custom, name)) return;
    delete custom[name];
    await Runtime.storage.local.set({ [userPresetsKey]: custom });
    const selected = await Runtime.storage.local.get(selectedPresetKey);
    if (selected[selectedPresetKey] === name) {
        await Runtime.storage.local.set({ [selectedPresetKey]: "Custom" });
    }
}

export async function renamePreset(currentName: string, nextName: string): Promise<string> {
    const normalizedName = nextName.trim();
    if (!normalizedName || normalizedName.length > 40) throw new Error("Preset names must contain 1 to 40 characters.");
    if (Object.hasOwn(Config.Presets, currentName)) throw new Error("Built-in presets cannot be renamed.");
    if (Object.hasOwn(Config.Presets, normalizedName)) throw new Error("That name is reserved for a built-in preset.");
    const result = await Runtime.storage.local.get(userPresetsKey);
    const stored = result[userPresetsKey];
    const custom = stored && typeof stored === "object" && !Array.isArray(stored)
        ? { ...stored as PresetCollection }
        : {};
    if (!Object.hasOwn(custom, currentName)) throw new Error("Select a saved user preset to rename.");
    if (normalizedName !== currentName && Object.hasOwn(custom, normalizedName)) throw new Error("A preset already uses that name.");
    const preset = custom[currentName];
    delete custom[currentName];
    custom[normalizedName] = preset;
    await Runtime.storage.local.set({ [userPresetsKey]: custom, [selectedPresetKey]: normalizedName });
    return normalizedName;
}

export async function applyPreset(name: string, preset: Preset): Promise<void> {
    const config = await getEqualizerConfig();
    const equalizerConfig = {
        ...config,
        shelfEndpoints: preset.shelfEndpoints
    };
    const values = {
        "equalizer-bands": preset.bands,
        "equalizer-qs": preset.q,
        "equalizer-config": equalizerConfig,
        convolver_mix: preset.convolver,
        stereo_seperation: preset.stereoWidener,
        "equalizer-offset": preset.offset,
        equalizer: preset.equalizer.map(gain => Math.max(-config.gainRange, Math.min(config.gainRange, gain)))
    };
    await Runtime.storage.local.set({
        ...values,
        [selectedPresetKey]: name
    });
    const tabs = await Runtime.tabs.query({});
    for (const tab of tabs) {
        if (tab.id == null) continue;
        for (const [key, value] of Object.entries(values)) {
            try {
                await Runtime.tabs.sendMessage(tab.id, {
                    action: `set-${key}`,
                    value,
                    transitionMs: 0
                });
            } catch (error) {
                Logger.logErr(`Unable to update ${key} in tab ${tab.id}:`, error);
            }
        }
    }
}

export async function getCurrentPreset(): Promise<Preset> {
    const bands = await getEqualizerBands();
    const config = await getEqualizerConfig();
    const q = await getEqualizerQs(bands.length, config.q);
    const result = await Runtime.storage.local.get(["convolver_mix", "stereo_seperation", "equalizer-offset", "equalizer"]);
    const equalizer = result.equalizer;
    return {
        convolver: typeof result.convolver_mix === "number" ? result.convolver_mix : 0,
        stereoWidener: typeof result.stereo_seperation === "number" ? result.stereo_seperation : 1,
        offset: typeof result["equalizer-offset"] === "number" ? result["equalizer-offset"] : 0,
        bands,
        q,
        shelfEndpoints: config.shelfEndpoints,
        equalizer: Array.isArray(equalizer) && equalizer.length === bands.length
            ? equalizer
            : Array(bands.length).fill(0)
    };
}
