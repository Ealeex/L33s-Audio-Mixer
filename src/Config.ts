export type Preset = {
    convolver: number;
    stereoWidener: number;
    equalizer: number[];
}

export class Config {

    static readonly EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000];

    static readonly Presets: Record<string, Preset> = {
        'Default': {
            convolver: 0,
            stereoWidener: 1,
            equalizer: [0,0,0,0,0,0,0,0,0]
        },
        'Bass-Boosted': {
            convolver: 0,
            stereoWidener: 1,
            equalizer: [10,10,10,5,0,0,5,10,10]
        },
        'Car Interior': {
            convolver: 0.8,
            stereoWidener: 1,
            equalizer: [15,15,15,5,0,0,5,10,10]
        }
    }

}

