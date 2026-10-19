import { Logger } from "../util/Logger";
import Runtime from "../util/Runtime";
import { Config } from "../Config";

export class WebEqualizer {

    private bands: number[];
    private sliders: HTMLInputElement[] = [];
    private min: number;
    private max: number;
    private step: number;
    private default: number;
    private storageName = "equalizer";

    constructor(opts?: { bands?: number[]; min?: number; max?: number; step?: number; default?: number }) {
        this.bands = opts?.bands ?? [];
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
        this.setValue(stored, false);
        this.sliders.forEach(slider => slider.addEventListener("input", () => this.sendData(true)));
    }

    private async sendData(manual: boolean = false) {
        const values = this.sliders.map(s => parseFloat(s.value));
        // Logger.log(values);
        if (values.some(v => Number.isNaN(v))) return;
        await Runtime.storage.local.set({ [this.storageName]: values });
        const tabs = await Runtime.tabs.query({});
        for (const tab of tabs) if (tab.id != null) try {
            Logger.log({ action: `set-${this.storageName}`, value: values });
            await Runtime.tabs.sendMessage(tab.id, { action: `set-${this.storageName}`, value: values });
        } catch {}
        if (manual) document.dispatchEvent(new CustomEvent('preset:manual-change'));
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

    setValue(values: number[], manual: boolean = false) {
        values = values.map((v, i) => Math.max(Math.min(v, this.max), this.min));
        values.forEach((v, i) => this.sliders[i].value = v.toString());
        this.sendData(manual);
    }

    animateToValue(values: number[], durationMs = Config.PRESET_TRANSITION_MS): void {
        const starts = this.getValue();
        const targets = this.sliders.map((_, index) => Math.max(Math.min(values[index] ?? 0, this.max), this.min));
        const startedAt = performance.now();
        const animate = (now: number) => {
            const progress = Math.min(1, (now - startedAt) / durationMs);
            const eased = progress * progress * progress * (progress * (progress * 6 - 15) + 10);
            this.sliders.forEach((slider, index) => {
                slider.value = (starts[index] + (targets[index] - starts[index]) * eased).toString();
            });
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    getValue(): number[] {
        return this.sliders.map(s => parseFloat(s.value));
    }
}
