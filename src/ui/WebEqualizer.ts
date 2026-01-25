import { Config } from "../Config";
import { Logger } from "../util/Logger";
import Runtime from "../util/Runtime";

export class WebEqualizer {

    private bands = Config.EQ_BANDS;
    private sliders: HTMLInputElement[] = [];
    private min: number;
    private max: number;
    private step: number;
    private default: number;
    private storageName = "equalizer";

    constructor(opts?: { min?: number; max?: number; step?: number; default?: number }) {
        this.min = opts?.min ?? -20;
        this.max = opts?.max ?? 20;
        this.step = opts?.step ?? 1;
        this.default = opts?.default ?? 0;

    }

    async init() {
        this.createElement();
        await this.setupStorage();
        return this;
    }

    private async setupStorage() {
        const result = await Runtime.storage.local.get(this.storageName);
        const stored: number[] = Array.isArray(result[this.storageName]) ? result[this.storageName] : this.bands.map(() => this.default);
        this.setValue(stored);
        this.sliders.forEach(slider => slider.addEventListener("input", () => this.sendData()));
    }

    private async sendData() {
        const values = this.sliders.map(s => parseFloat(s.value));
        // Logger.log(values);
        if (values.some(v => Number.isNaN(v))) return;
        await Runtime.storage.local.set({ [this.storageName]: values });
        const tabs = await Runtime.tabs.query({});
        for (const tab of tabs) if (tab.id != null) try {
            Logger.log({ action: `set-${this.storageName}`, value: values });
            await Runtime.tabs.sendMessage(tab.id, { action: `set-${this.storageName}`, value: values });
        } catch {}
    }

    private createElement() {
        const container = document.createElement("div");
        container.classList.add("equalizer-container");
        this.bands.forEach(frequency => {
            const rangeContainer = document.createElement("div");
            rangeContainer.classList.add("equalizer-range-container");

            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = this.min.toString();
            slider.max = this.max.toString();
            slider.step = this.step.toString();
            slider.value = this.default.toString();
            slider.classList.add("equalizer-range");

            const label = document.createElement("label");
            label.innerText = frequency.toString().replace("000", "k");

            rangeContainer.appendChild(slider);
            rangeContainer.appendChild(label);
            container.appendChild(rangeContainer);

            this.sliders.push(slider);
        });
        document.getElementById("wrapper")!.appendChild(container);
    }

    setValue(values: number[]) {
        values = values.map((v, i) => Math.max(Math.min(v, this.max), this.min));
        values.forEach((v, i) => this.sliders[i].value = v.toString());
        this.sendData();
    }
}
