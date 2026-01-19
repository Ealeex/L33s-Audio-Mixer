import { Config } from "../Config";
import Runtime from "../util/Runtime";

export class WebEqualizer {

    bands = Config.EQ_BANDS;
    min:number;
    max:number;
    step:number;
    default:number;

    constructor(opts?:{min?:number, max?:number, step?:number, default?:number}) {
        this.min = opts?.min ?? -20;
        this.max = opts?.max ?? 20;
        this.step = opts?.step ?? 1;
        this.default = opts?.default ?? 0;
        this.createElement();
    }

    async createBandRange(frequency:number) {

        // Range Container
        let rangeContainer = document.createElement('div');
        rangeContainer.classList.add('equalizer-range-container');

        // Range Input
        let range = document.createElement('input');
        range.type = 'range';
        range.min = this.min.toString();
        range.max = this.max.toString();
        range.step = this.step.toString();
        range.value = this.default.toString();
        range.classList.add('equalizer-range');
        rangeContainer.appendChild(range);

        let storageName = `band-${frequency}`;

        // Load any settings
        let result = await Runtime.storage.local.get(storageName);
        range.value = (typeof result[storageName] === 'number' ? result[storageName] : this.default).toString();

        // Add Listener
        range.addEventListener('input', () => {
            const value = parseFloat(range.value);
            Runtime.storage.local.set({ [storageName]: value });
            Runtime.tabs.query({}).then((tabs) => {
                for (const tab of tabs)
                    if (tab.id !== undefined) Runtime.tabs.sendMessage(tab.id, { action: `set-${storageName}`, value });
            });
        });
        
        // Label
        let label = document.createElement('label');
        label.innerText = frequency.toString().replace('000', 'k');
        rangeContainer.appendChild(label);

        return rangeContainer;
    }

    createElement() {
        let container = document.createElement('div');
        container.classList.add('equalizer-container');
        this.bands.forEach(async band => { container.appendChild(await this.createBandRange(band)); })
        document.body.appendChild(container);
    }

}