import { Config } from "../Config";
import Runtime from "./Runtime";

export const equalizerBandsKey = "equalizer-bands";
export const equalizerConfigKey = "equalizer-config";
export const equalizerQsKey = "equalizer-qs";

export type EqualizerConfig = {
    q: number;
    gainRange: number;
    gainStep: number;
    shelfEndpoints: boolean;
};

export const defaultEqualizerConfig: EqualizerConfig = {
    q: 1,
    gainRange: 25,
    gainStep: 2,
    shelfEndpoints: true
};

export function validateEqualizerConfig(value: unknown): EqualizerConfig {
    if (!value || typeof value !== "object") return { ...defaultEqualizerConfig };
    const candidate = value as Partial<EqualizerConfig>;
    const q = Number(candidate.q);
    const gainRange = Number(candidate.gainRange);
    const gainStep = Number(candidate.gainStep);
    if (!Number.isFinite(q) || q < 0.3 || q > 4) throw new Error("Filter Q must be between 0.3 and 4.");
    if (!Number.isFinite(gainRange) || gainRange < 6 || gainRange > 30) throw new Error("Gain range must be between 6 and 30 dB.");
    if (![0.5, 1, 2].includes(gainStep)) throw new Error("Gain increment must be 0.5, 1, or 2 dB.");
    return {
        q,
        gainRange,
        gainStep,
        shelfEndpoints: candidate.shelfEndpoints !== false
    };
}

export async function getEqualizerConfig(): Promise<EqualizerConfig> {
    const result = await Runtime.storage.local.get(equalizerConfigKey);
    try {
        const config = validateEqualizerConfig(result[equalizerConfigKey] ?? defaultEqualizerConfig);
        if (config.gainRange === 20) {
            const upgraded = { ...config, gainRange: 25 };
            await Runtime.storage.local.set({ [equalizerConfigKey]: upgraded });
            return upgraded;
        }
        return config;
    } catch {
        return { ...defaultEqualizerConfig };
    }
}

export function validateEqualizerBands(value: unknown): number[] {
    if (!Array.isArray(value)
        || value.length < Config.MIN_EQ_BANDS
        || value.length > Config.MAX_EQ_BANDS) {
        throw new Error(`Choose between ${Config.MIN_EQ_BANDS} and ${Config.MAX_EQ_BANDS} equalizer bands.`);
    }
    const bands = value.map(Number);
    if (bands.some(frequency => !Number.isFinite(frequency) || frequency < 20 || frequency > 20000)) {
        throw new Error("Band frequencies must be between 20 Hz and 20 kHz.");
    }
    return bands;
}

export async function getEqualizerBands(): Promise<number[]> {
    const result = await Runtime.storage.local.get(equalizerBandsKey);
    try {
        return validateEqualizerBands(result[equalizerBandsKey]);
    } catch {
        return [...Config.EQ_BANDS];
    }
}

export async function getEqualizerQs(bandCount: number, defaultQ = defaultEqualizerConfig.q): Promise<number[]> {
    const result = await Runtime.storage.local.get(equalizerQsKey);
    const stored = result[equalizerQsKey];
    if (Array.isArray(stored) && stored.length === bandCount
        && stored.every(q => typeof q === "number" && q >= .3 && q <= 4)) return [...stored];
    return Array(bandCount).fill(defaultQ);
}

export function createLogSpacedBands(count: number, minimum = 32, maximum = 8000): number[] {
    const requestedCount = Number.isFinite(count) ? Math.round(count) : Config.EQ_BANDS.length;
    const safeCount = Math.max(Config.MIN_EQ_BANDS, Math.min(Config.MAX_EQ_BANDS, requestedCount));
    const ratio = Math.pow(maximum / minimum, 1 / (safeCount - 1));
    return Array.from({ length: safeCount }, (_, index) => Math.round(minimum * Math.pow(ratio, index)));
}

export function remapEqualizerGains(sourceBands: number[], sourceGains: number[], targetBands: number[]): number[] {
    if (sourceBands.length !== sourceGains.length || sourceBands.length === 0) {
        return targetBands.map(() => 0);
    }
    const sorted = sourceBands.map((frequency, index) => ({ frequency, gain: sourceGains[index] }))
        .sort((a, b) => a.frequency - b.frequency);
    const frequencies = sorted.map(item => item.frequency);
    const gains = sorted.map(item => item.gain);
    return targetBands.map(frequency => {
        if (frequency <= frequencies[0]) return gains[0];
        const lastIndex = frequencies.length - 1;
        if (frequency >= frequencies[lastIndex]) return gains[lastIndex];
        const upperIndex = frequencies.findIndex(sourceFrequency => sourceFrequency >= frequency);
        const lowerIndex = upperIndex - 1;
        const lower = Math.log(frequencies[lowerIndex]);
        const upper = Math.log(frequencies[upperIndex]);
        const position = (Math.log(frequency) - lower) / (upper - lower);
        return gains[lowerIndex] + (gains[upperIndex] - gains[lowerIndex]) * position;
    });
}
