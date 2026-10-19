import { Config, Preset } from "../Config";
import Runtime from "../util/Runtime";
import { applyPreset, deletePreset, getPresets, PresetCollection } from "../util/PresetStore";

export class PresetManager {
    element: HTMLDivElement;
    valueChanged: (preset: Preset, name: string) => void = () => {};
    private presets: PresetCollection = {};
    private selectedName = "3 Bands";
    private trigger: HTMLButtonElement;
    private triggerLabel: HTMLSpanElement;
    private menu: HTMLDivElement;

    constructor(mount: HTMLElement = document.getElementById("preset-control")!) {
        this.element = document.createElement("div");
        this.element.className = "preset-menu-control";
        this.trigger = document.createElement("button");
        this.trigger.type = "button";
        this.trigger.className = "preset-menu-trigger";
        this.trigger.setAttribute("aria-haspopup", "listbox");
        this.trigger.setAttribute("aria-expanded", "false");
        this.triggerLabel = document.createElement("span");
        const chevron = document.createElement("i");
        chevron.setAttribute("aria-hidden", "true");
        this.trigger.append(this.triggerLabel, chevron);
        this.menu = document.createElement("div");
        this.menu.className = "preset-menu";
        this.menu.setAttribute("role", "listbox");
        this.menu.hidden = true;
        this.element.append(this.trigger, this.menu);
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
        this.selectedName = selectedName ?? (
            typeof storedName === "string" && (storedName === "Custom" || selectedPreset)
                ? storedName
                : "3 Bands"
        );
        this.renderMenu();
        this.updateTrigger();
        await Runtime.storage.local.set({ "selected-preset": this.selectedName });
    }

    getSelectedName(): string {
        return this.selectedName;
    }

    private renderMenu(): void {
        this.menu.replaceChildren();
        for (const [name, preset] of Object.entries(this.presets)) {
            const row = document.createElement("div");
            row.className = "preset-menu-row";
            row.setAttribute("role", "option");
            row.setAttribute("aria-selected", String(name === this.selectedName));
            const select = document.createElement("button");
            select.type = "button";
            select.className = "preset-menu-option";
            select.textContent = name;
            select.addEventListener("click", () => { void this.selectPreset(name, preset); });
            row.appendChild(select);
            if (!Object.hasOwn(Config.Presets, name)) {
                const remove = document.createElement("button");
                remove.type = "button";
                remove.className = "preset-menu-delete";
                remove.title = `Delete ${name}`;
                remove.setAttribute("aria-label", `Delete preset ${name}`);
                remove.textContent = "×";
                remove.addEventListener("click", event => {
                    event.stopPropagation();
                    void this.removePreset(name);
                });
                row.appendChild(remove);
            }
            this.menu.appendChild(row);
        }
        const customRow = document.createElement("div");
        customRow.className = "preset-menu-row is-custom";
        customRow.setAttribute("role", "option");
        customRow.setAttribute("aria-selected", String(this.selectedName === "Custom"));
        const customLabel = document.createElement("span");
        customLabel.className = "preset-menu-option";
        customLabel.textContent = "Unsaved changes";
        customRow.appendChild(customLabel);
        this.menu.appendChild(customRow);
    }

    private async selectPreset(name: string, preset: Preset): Promise<void> {
        this.selectedName = name;
        this.updateTrigger();
        this.closeMenu();
        await applyPreset(name, preset);
        this.renderMenu();
        this.valueChanged(preset, name);
    }

    private async removePreset(name: string): Promise<void> {
        await deletePreset(name);
        if (this.selectedName === name) this.selectedName = "Custom";
        await this.refresh(this.selectedName);
    }

    private updateTrigger(): void {
        this.triggerLabel.textContent = this.selectedName === "Custom" ? "Unsaved changes" : this.selectedName;
    }

    private openMenu(): void {
        this.menu.hidden = false;
        this.trigger.setAttribute("aria-expanded", "true");
    }

    private closeMenu(): void {
        this.menu.hidden = true;
        this.trigger.setAttribute("aria-expanded", "false");
    }

    private setupAction(): void {
        this.trigger.addEventListener("click", () => {
            if (this.menu.hidden) this.openMenu(); else this.closeMenu();
        });
        document.addEventListener("pointerdown", event => {
            if (!this.element.contains(event.target as Node)) this.closeMenu();
        });
        document.addEventListener("keydown", event => {
            if (event.key === "Escape") this.closeMenu();
        });
        document.addEventListener("preset:manual-change", async () => {
            this.selectedName = "Custom";
            this.updateTrigger();
            this.renderMenu();
            await Runtime.storage.local.set({ "selected-preset": "Custom" });
        });
    }
}
