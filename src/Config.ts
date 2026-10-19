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
        'Default': {
            convolver: 0,
            stereoWidener: 1,
            offset: 0,
            equalizer: [0,0,0,0,0,0,0,0,0],
            bands: Config.EQ_BANDS,
            q: Array(9).fill(1),
            shelfEndpoints: true
        },
        'Bass-Boosted': {
            convolver: 0,
            stereoWidener: 1,
            offset: 0,
            equalizer: [10,10,10,5,0,0,5,10,10],
            bands: Config.EQ_BANDS,
            q: Array(9).fill(0.8),
            shelfEndpoints: true
        },
        'Car Interior': {
            convolver: 0.8,
            stereoWidener: 1,
            offset: 0,
            equalizer: [15,15,15,5,0,0,5,10,10],
            bands: Config.EQ_BANDS,
            q: Array(9).fill(0.9),
            shelfEndpoints: true
        }
    }

}
