import { Config, Preset } from "../Config";
import Runtime from "../util/Runtime";

export class PresetManager {

    element!: HTMLSelectElement;
    valueChanged!: (preset: Preset) => void;
    private _loadedPresetName: string | null = null;

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
        // Add a "Custom" option to represent user-made adjustments
        const customOpt = document.createElement('option');
        customOpt.value = 'Custom';
        customOpt.innerText = 'Custom';
        elem.appendChild(customOpt);
        document.getElementById('wrapper')!.appendChild(elem);
        return elem;
    }

    setupAction() {
        this.valueChanged = (preset: Preset) => {};
        this.element.addEventListener('change', async () => {
            const name = this.element.value;
            if (name === 'Custom') {
                const result = await Runtime.storage.local.get('preset-custom');
                const preset = result['preset-custom'];
                if (!preset) return;
                this.valueChanged(preset as Preset);
                await Runtime.storage.local.set({ 'selected-preset': 'Custom' });
                return;
            }

            const preset = Config.Presets[name];
            if (!preset) return;
            this.valueChanged(preset);
            await Runtime.storage.local.set({ 'selected-preset': name });
        });

        // When the user changes other controls manually, mark select as Custom
        document.addEventListener('preset:manual-change', async () => {
            this.element.value = 'Custom';
            await Runtime.storage.local.set({ 'selected-preset': 'Custom' });
        });
    }

    async loadActivePreset() {
        const result = await Runtime.storage.local.get('selected-preset');
        let selectedPreset = result['selected-preset'];

        // Treat 'Custom' as a valid stored selection even though it's not in Config.Presets
        if (!selectedPreset || (selectedPreset !== 'Custom' && !Config.Presets[selectedPreset])) {
            selectedPreset = 'Default';
            await Runtime.storage.local.set({ 'selected-preset': selectedPreset });
        }

        this.element.value = selectedPreset;
        this._loadedPresetName = selectedPreset;
    }
    
}
