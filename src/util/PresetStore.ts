import { Config, Preset } from "../Config";
import Runtime from "./Runtime";
import { Logger } from "./Logger";
import { getEqualizerBands, getEqualizerConfig, remapEqualizerGains, validateEqualizerBands } from "./EqualizerSettings";

const userPresetsKey = "user-presets";
const selectedPresetKey = "selected-preset";

export type PresetCollection = Record<string, Preset>;

function isPreset(value: unknown): value is Preset {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<Preset>;
    return typeof candidate.convolver === "number"
        && Number.isFinite(candidate.convolver)
        && typeof candidate.stereoWidener === "number"
        && Number.isFinite(candidate.stereoWidener)
        && Array.isArray(candidate.equalizer)
        && candidate.equalizer.length >= Config.MIN_EQ_BANDS
        && candidate.equalizer.length <= Config.MAX_EQ_BANDS
        && (candidate.bands === undefined
            || (Array.isArray(candidate.bands) && candidate.bands.length === candidate.equalizer.length))
        && candidate.equalizer.every(gain => typeof gain === "number" && Number.isFinite(gain));
}

function adaptPreset(preset: Preset, targetBands: number[]): Preset {
    let sourceBands = Config.EQ_BANDS;
    if (preset.bands) {
        try { sourceBands = validateEqualizerBands(preset.bands); } catch {}
    } else if (preset.equalizer.length !== Config.EQ_BANDS.length) {
        sourceBands = targetBands.length === preset.equalizer.length ? targetBands : Config.EQ_BANDS;
    }
    return {
        convolver: preset.convolver,
        stereoWidener: preset.stereoWidener,
        equalizer: remapEqualizerGains(sourceBands, preset.equalizer, targetBands),
        bands: [...targetBands]
    };
}

export async function getPresets(): Promise<PresetCollection> {
    const bands = await getEqualizerBands();
    const result = await Runtime.storage.local.get(userPresetsKey);
    const saved = result[userPresetsKey];
    const custom: PresetCollection = {};
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        for (const [name, preset] of Object.entries(saved)) {
            if (name.trim() && !Object.hasOwn(Config.Presets, name) && isPreset(preset)) {
                custom[name] = adaptPreset(preset, bands);
            }
        }
    }
    return {
        ...Object.fromEntries(Object.entries(Config.Presets).map(([name, preset]) => [name, adaptPreset(preset, bands)])),
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

export async function applyPreset(name: string, preset: Preset): Promise<void> {
    const config = await getEqualizerConfig();
    const values = {
        convolver_mix: preset.convolver,
        stereo_seperation: preset.stereoWidener,
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
                    transitionMs: Config.PRESET_TRANSITION_MS
                });
            } catch (error) {
                Logger.logErr(`Unable to update ${key} in tab ${tab.id}:`, error);
            }
        }
    }
}

export async function getCurrentPreset(): Promise<Preset> {
    const bands = await getEqualizerBands();
    const result = await Runtime.storage.local.get([
        "convolver_mix",
        "stereo_seperation",
        "equalizer"
    ]);
    const equalizer = result.equalizer;
    return {
        convolver: typeof result.convolver_mix === "number" ? result.convolver_mix : 0,
        stereoWidener: typeof result.stereo_seperation === "number" ? result.stereo_seperation : 1,
        bands,
        equalizer: Array.isArray(equalizer) && equalizer.length === bands.length
            ? equalizer
            : Array(bands.length).fill(0)
    };
}
