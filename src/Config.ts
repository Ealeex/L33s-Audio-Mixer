export type Preset = {
    convolver: number;
    stereoWidener: number;
    offset: number;
    equalizer: number[];
    bands: number[];
    q: number[];
    shelfEndpoints: boolean;
}

export class Config {

    static readonly EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000];
    static readonly MIN_EQ_BANDS = 2;
    static readonly MAX_EQ_BANDS = 16;
    static readonly PRESET_TRANSITION_MS = 650;

    static readonly Presets: Record<string, Preset> = {
        '3 Bands': {
            convolver: 0,
            stereoWidener: 1,
            offset: 0,
            equalizer: [0, 0, 0],
            bands: [63, 632, 6324],
            // Curve-matched against FL Studio's 61% bandwidth display.
            q: [0.4, 0.4, 0.4],
            shelfEndpoints: true
        },
        'Bass Boost': {
            convolver: 0,
            stereoWidener: 1,
            offset: 0,
            equalizer: [8.333333333333336, -7.598850574712645, -6.3218390804597675, 4.885057471264368],
            bands: [485, 742, 1890, 2655],
            q: [0.4, 0.7848018923390606, 0.7708421613559244, 0.4],
            shelfEndpoints: true
        },
        'Super Bass': {
            convolver: 0,
            stereoWidener: 1,
            offset: 0,
            equalizer: [8.245137392241379, -4.1285156249999995, 3.4210174209770092],
            bands: [194, 632, 1972],
            q: [0.4, 0.4, 0.4],
            shelfEndpoints: true
        },
        'Car Interior': {
            convolver: 0.848148148148148,
            stereoWidener: 1,
            offset: 0,
            equalizer: [18, -4, -2.5, -3.5, 6],
            bands: [280, 720, 1600, 4200, 9500],
            q: [0.4, 0.8, 0.7, 0.9, 0.4],
            shelfEndpoints: true
        }
    }

}
