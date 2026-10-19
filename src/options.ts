import Runtime from "./util/Runtime";
import { applyPreset, deletePreset, getCurrentPreset, getPresets, savePreset } from "./util/PresetStore";
import { Logger } from "./util/Logger";
import { Config, Preset } from "./Config";

type VisualizerSettings = { frequency: boolean; waveform: boolean };

function presetSummary(preset: Preset): string {
    const average = preset.equalizer.reduce((sum, gain) => sum + gain, 0) / preset.equalizer.length;
    return `Reverb ${Math.round(preset.convolver * 100)}% · Width ${preset.stereoWidener.toFixed(1)} · EQ ${average >= 0 ? "+" : ""}${average.toFixed(1)} dB`;
}

function makeButton(label: string, className: string, action: () => void): HTMLButtonElement {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    element.className = className;
    element.addEventListener("click", action);
    return element;
}

document.addEventListener("DOMContentLoaded", async () => {
    document.querySelectorAll<HTMLAnchorElement>(".topnav a").forEach(link => {
        link.addEventListener("click", () => {
            document.querySelector(".topnav a.active")?.classList.remove("active");
            link.classList.add("active");
        });
    });

    const status = document.getElementById("status-message")!;
    const setStatus = (message: string, isError = false) => {
        status.textContent = message;
        status.classList.toggle("is-error", isError);
    };

    const visualizerResult = await Runtime.storage.local.get("visualizer-settings");
    const storedVisualizers = visualizerResult["visualizer-settings"];
    const visualizers: VisualizerSettings = {
        frequency: storedVisualizers?.frequency !== false,
        waveform: storedVisualizers?.waveform !== false
    };

    const frequencyToggle = document.getElementById("frequency-toggle") as HTMLInputElement;
    const waveformToggle = document.getElementById("waveform-toggle") as HTMLInputElement;
    frequencyToggle.checked = visualizers.frequency;
    waveformToggle.checked = visualizers.waveform;

    const saveVisualizerSettings = async () => {
        visualizers.frequency = frequencyToggle.checked;
        visualizers.waveform = waveformToggle.checked;
        try {
            await Runtime.storage.local.set({ "visualizer-settings": { ...visualizers } });
            setStatus("Visualizer preferences saved.");
        } catch (error) {
            Logger.logErr("Unable to save visualizer preferences:", error);
            setStatus("Could not save visualizer preferences.", true);
        }
    };
    frequencyToggle.addEventListener("change", () => { void saveVisualizerSettings(); });
    waveformToggle.addEventListener("change", () => { void saveVisualizerSettings(); });

    const presetList = document.getElementById("preset-list")!;
    const presetCount = document.getElementById("preset-count")!;

    const renderPresets = async () => {
        const presets = await getPresets();
        presetList.replaceChildren();
        presetCount.textContent = `${Object.keys(presets).length} presets`;
        for (const [name, preset] of Object.entries(presets)) {
            const isBuiltIn = Object.hasOwn(Config.Presets, name);
            const row = document.createElement("article");
            row.className = "preset-row";

            const info = document.createElement("div");
            info.className = "preset-info";
            const title = document.createElement("h3");
            title.textContent = name;
            const summary = document.createElement("p");
            summary.textContent = presetSummary(preset);
            info.append(title, summary);

            const actions = document.createElement("div");
            actions.className = "preset-actions";
            actions.appendChild(makeButton("Apply", "button button-secondary", () => {
                void applyPreset(name, preset).then(() => setStatus(`Applied “${name}”.`)).catch(error => {
                    Logger.logErr("Unable to apply preset:", error);
                    setStatus("Could not apply this preset.", true);
                });
            }));
            if (!isBuiltIn) {
                actions.appendChild(makeButton("Delete", "button button-quiet", () => {
                    void deletePreset(name).then(renderPresets).then(() => setStatus(`Deleted “${name}”.`)).catch(error => {
                        Logger.logErr("Unable to delete preset:", error);
                        setStatus("Could not delete this preset.", true);
                    });
                }));
            } else {
                const tag = document.createElement("span");
                tag.className = "preset-tag";
                tag.textContent = "BUILT IN";
                actions.appendChild(tag);
            }
            row.append(info, actions);
            presetList.appendChild(row);
        }
    };

    const presetForm = document.getElementById("preset-form") as HTMLFormElement;
    const presetName = document.getElementById("new-preset-name") as HTMLInputElement;
    presetForm.addEventListener("submit", async event => {
        event.preventDefault();
        try {
            const name = await savePreset(presetName.value, await getCurrentPreset());
            presetName.value = "";
            await renderPresets();
            setStatus(`Saved “${name}”.`);
        } catch (error) {
            Logger.logErr("Unable to save preset:", error);
            setStatus(error instanceof Error ? error.message : "Could not save this preset.", true);
        }
    });

    await renderPresets();
});
