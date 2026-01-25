import { Config, Preset } from "../Config";
import Runtime from "../util/Runtime";

export class PresetManager {

    element!: HTMLSelectElement;
    valueChanged!: (preset: Preset) => void;

    constructor() {
        this.element = this.createElement();
        this.setupAction();
        this.loadActivePreset();
    }

    createElement() {
        const elem = document.createElement('select');
        for (const preset of Object.keys(Config.Presets)) {
            const option = document.createElement('option');
            option.value = preset;      // use key as value
            option.innerText = preset;  // display text
            elem.appendChild(option);
        }
        document.getElementById('wrapper')!.appendChild(elem);
        return elem;
    }

    setupAction() {
        this.valueChanged = (preset: Preset) => {};
        this.element.addEventListener('change', async () => {
            const name = this.element.value;
            const preset = Config.Presets[name];
            if (!preset) return;                // safeguard
            this.valueChanged(preset);
            await Runtime.storage.local.set({ 'selected-preset': name });
        });
    }

    async loadActivePreset() {
        const result = await Runtime.storage.local.get('selected-preset');
        let selectedPreset = result['selected-preset'];

        if (!selectedPreset || !Config.Presets[selectedPreset]) {
            selectedPreset = 'Default';
            await Runtime.storage.local.set({ 'selected-preset': selectedPreset });
        }

        this.element.value = selectedPreset;
        this.valueChanged(Config.Presets[selectedPreset]); // optional: broadcast initial selection
    }
}
