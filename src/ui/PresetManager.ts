import { Preset } from "../Config";
import Runtime from "../util/Runtime";
import { applyPreset, getPresets, PresetCollection } from "../util/PresetStore";

export class PresetManager {

    element: HTMLSelectElement;
    valueChanged: (preset: Preset, name: string) => void = () => {};
    private presets: PresetCollection = {};

    constructor(mount: HTMLElement = document.getElementById("preset-control")!, compact = false) {
        this.element = document.createElement("select");
        this.element.classList.add(compact ? "module-preset-select" : "preset-select");
        this.element.setAttribute("aria-label", "Active preset");
        mount.appendChild(this.element);
        this.setupAction();
    }

    async init(): Promise<this> {
        await this.refresh();
        return this;
    }

    async refresh(selectedName?: string): Promise<void> {
        this.presets = await getPresets();
        const result = await Runtime.storage.local.get("selected-preset");
        const storedName = result["selected-preset"];
        const selectedPreset = typeof storedName === "string" ? this.presets[storedName] : undefined;
        const selected = selectedName ?? (
            typeof storedName === "string" && (storedName === "Custom" || selectedPreset)
                ? storedName
                : "Default"
        );

        this.element.replaceChildren();
        for (const name of Object.keys(this.presets)) {
            const option = document.createElement("option");
            option.value = name;
            option.textContent = name;
            this.element.appendChild(option);
        }
        const customOption = document.createElement("option");
        customOption.value = "Custom";
        customOption.textContent = "Unsaved changes";
        this.element.appendChild(customOption);
        this.element.value = selected;
        await Runtime.storage.local.set({ "selected-preset": selected });
    }

    getSelectedName(): string {
        return this.element.value;
    }

    private setupAction(): void {
        this.element.addEventListener("change", async () => {
            const name = this.element.value;
            const preset = this.presets[name];
            if (!preset) return;
            await applyPreset(name, preset);
            this.valueChanged(preset, name);
        });

        document.addEventListener("preset:manual-change", async () => {
            this.element.value = "Custom";
            await Runtime.storage.local.set({ "selected-preset": "Custom" });
        });
    }
}
