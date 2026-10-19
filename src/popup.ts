import { UserRangeOption } from "./ui/UserRangeOption";
import { WebEqualizer } from "./ui/WebEqualizer";
import { FrequencyDisplay } from "./ui/FrequencyDisplay";
import { WaveformDisplay } from "./ui/WaveformDisplay";
import { PresetManager } from "./ui/PresetManager";
import { Logger } from "./util/Logger";
import { Config, Preset } from "./Config";
import Runtime from "./util/Runtime";
import { applyPreset, ensureSelectedPresetApplied, getCurrentPreset, getPresets, parsePreset, renamePreset, savePreset, serializePreset } from "./util/PresetStore";
import { getEqualizerBands, getEqualizerConfig, getEqualizerQs } from "./util/EqualizerSettings";

type VisualizerSettings = { frequency: boolean; waveform: boolean };

function createModuleWidget(options: {
    title: string;
    eyebrow: string;
    description?: string;
    actions?: HTMLElement;
}): { body: HTMLElement; widget: HTMLElement } {
    const widget = document.createElement("section");
    widget.className = "audio-module-widget";
    widget.setAttribute("aria-label", options.title);
    const header = document.createElement("header");
    const copy = document.createElement("div");
    const eyebrow = document.createElement("span");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = options.eyebrow;
    const title = document.createElement("h2");
    title.textContent = options.title;
    copy.append(eyebrow, title);
    if (options.description) {
        const description = document.createElement("small");
        description.className = "module-description";
        description.textContent = options.description;
        copy.append(description);
    }
    header.append(copy);
    if (options.actions) header.append(options.actions);
    const body = document.createElement("div");
    body.className = "audio-module-body";
    widget.append(header, body);
    document.getElementById("wrapper")!.appendChild(widget);
    return { body, widget };
}

function createPowerButton(label: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "module-power-button";
    button.title = label;
    button.setAttribute("aria-label", label);
    return button;
}

function setPowerState(button: HTMLButtonElement, enabled: boolean): void {
    button.classList.toggle("is-on", enabled);
    button.setAttribute("aria-pressed", String(enabled));
}

async function sendSetting(name: string, value: number | boolean, transitionMs = Config.PRESET_TRANSITION_MS): Promise<void> {
    await Runtime.storage.local.set({ [name]: value });
    const tabs = await Runtime.tabs.query({});
    for (const tab of tabs) if (tab.id != null) try {
        await Runtime.tabs.sendMessage(tab.id, { action: `set-${name}`, value, transitionMs });
    } catch {}
}

function isVisualizerData(message: object): message is {
    frequency: number[] | null;
    sourceFrequency: number[] | null;
    waveform: number[] | null;
    frequencyMinimum: number;
    frequencyMaximum: number;
    sampleRate: number;
} {
    return 'frequency' in message
        && (message.frequency === null || (Array.isArray(message.frequency) && message.frequency.every(value => typeof value === 'number')))
        && 'sourceFrequency' in message
        && (message.sourceFrequency === null || (Array.isArray(message.sourceFrequency) && message.sourceFrequency.every(value => typeof value === 'number')))
        && 'waveform' in message
        && (message.waveform === null || (Array.isArray(message.waveform) && message.waveform.every(value => typeof value === 'number')))
        && 'frequencyMinimum' in message && typeof message.frequencyMinimum === 'number'
        && 'frequencyMaximum' in message && typeof message.frequencyMaximum === 'number'
        && 'sampleRate' in message && typeof message.sampleRate === 'number';
}

document.addEventListener('DOMContentLoaded', async() => {
    Logger.log("Initializing Popup");

    await ensureSelectedPresetApplied();

    const frequencyDisplay = new FrequencyDisplay();
    const waveformDisplay = new WaveformDisplay();
    let equalizer: WebEqualizer | null = null;
    let visualizerPort: ReturnType<typeof Runtime.tabs.connect> | null = null;
    let activeTabId: number | undefined;

    const setVisualizerSettings = (settings: VisualizerSettings) => {
        frequencyDisplay.canvas.hidden = true;
        waveformDisplay.canvas.hidden = !settings.waveform;
        equalizer?.setSpectrumEnabled(settings.frequency);
        if (settings.frequency || settings.waveform) {
            if (visualizerPort || activeTabId == null) return;
            try {
                const port = Runtime.tabs.connect(activeTabId, { name: 'audio-visualizer' });
                visualizerPort = port;
                port.onMessage.addListener((message: object) => {
                    if (!isVisualizerData(message)) return;
                    if (message.frequency) {
                        frequencyDisplay.draw(message.frequency);
                        equalizer?.setSpectrumData(message.sourceFrequency ?? message.frequency, message.frequency, {
                            minimumFrequency: message.frequencyMinimum,
                            maximumFrequency: message.frequencyMaximum,
                            sampleRate: message.sampleRate
                        });
                    }
                    if (message.waveform) waveformDisplay.draw(message.waveform);
                });
                port.onDisconnect.addListener(() => {
                    visualizerPort = null;
                });
            } catch (error) {
                Logger.logErr('Unable to connect to the active tab visualizer:', error);
            }
        } else if (visualizerPort) {
            visualizerPort.disconnect();
            visualizerPort = null;
        }
    };

    try {
        const [activeTab] = await Runtime.tabs.query({ active: true, currentWindow: true });
        activeTabId = activeTab?.id;
    } catch (error) {
        Logger.logErr('Unable to find the active tab for visualizers:', error);
    }
    const storedVisualizers = await Runtime.storage.local.get('visualizer-settings');
    const configuredVisualizers = storedVisualizers['visualizer-settings'];
    const initialVisualizerSettings: VisualizerSettings = {
        frequency: configuredVisualizers?.frequency !== false,
        waveform: configuredVisualizers?.waveform !== false
    };
    setVisualizerSettings(initialVisualizerSettings);

    Runtime.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes['visualizer-settings']) return;
        const settings = changes['visualizer-settings'].newValue;
        if (!settings || typeof settings !== 'object') return;
        setVisualizerSettings({
            frequency: settings.frequency !== false,
            waveform: settings.waveform !== false
        });
    });

    let convolverOpt!: UserRangeOption;
    const convolverPower = createPowerButton("Toggle convolution");
    const spatialWidget = createModuleWidget({
        eyebrow: "SPACE",
        title: "Spatial",
        actions: convolverPower
    });

    const stereoRow = document.createElement("label");
    stereoRow.className = "setting-toggle-row";
    const stereoLabel = document.createElement("span");
    stereoLabel.textContent = "Mono output";
    const stereoToggle = document.createElement("input");
    stereoToggle.type = "checkbox";
    stereoToggle.className = "setting-toggle";
    const stereoResult = await Runtime.storage.local.get("stereo_seperation");
    stereoToggle.checked = stereoResult.stereo_seperation === 0;
    stereoToggle.addEventListener("change", () => {
        void sendSetting("stereo_seperation", stereoToggle.checked ? 0 : 1);
        document.dispatchEvent(new CustomEvent("preset:manual-change"));
    });
    stereoRow.append(stereoLabel, stereoToggle);
    spatialWidget.body.appendChild(stereoRow);

    let lastConvolverMix = .5;
    convolverOpt = await new UserRangeOption({name:'Convolution mix', storageName:'convolver_mix', step:"any", mount: spatialWidget.body, onValueChanged: value => {
        if (value > 0) lastConvolverMix = value;
        setPowerState(convolverPower, value > 0);
    }}).init();
    if (convolverOpt.getValue() > 0) lastConvolverMix = convolverOpt.getValue();
    setPowerState(convolverPower, convolverOpt.getValue() > 0);
    convolverPower.addEventListener("click", () => convolverOpt.applyPresetValue(convolverOpt.getValue() > 0 ? 0 : lastConvolverMix));

    const equalizerBands = await getEqualizerBands();
    const equalizerConfig = await getEqualizerConfig();
    const equalizerQs = await getEqualizerQs(equalizerBands.length, equalizerConfig.q);
    const equalizerActions = document.createElement("div");
    equalizerActions.className = "module-header-actions";
    const bakeOffsetButton = document.createElement("button");
    bakeOffsetButton.type = "button";
    bakeOffsetButton.className = "module-tool-button";
    bakeOffsetButton.textContent = "0";
    bakeOffsetButton.title = "Bake master offset into the EQ curve";
    bakeOffsetButton.setAttribute("aria-label", "Bake master offset into the equalizer curve and reset it to zero");
    const equalizerPower = createPowerButton("Toggle equalizer");
    equalizerActions.append(bakeOffsetButton, equalizerPower);
    const equalizerWidget = createModuleWidget({
        eyebrow: "TONE",
        title: "Parametric equalizer",
        description: "Drag nodes · scroll nodes for Q · scroll graph for bands",
        actions: equalizerActions
    });
    const offsetMount = document.createElement("div");
    offsetMount.className = "equalizer-offset-control";
    const equalizerEnabledResult = await Runtime.storage.local.get("equalizer-enabled");
    let equalizerEnabled = equalizerEnabledResult["equalizer-enabled"] !== false;
    setPowerState(equalizerPower, equalizerEnabled);
    equalizer = await new WebEqualizer({
        bands: equalizerBands,
        min: -equalizerConfig.gainRange,
        max: equalizerConfig.gainRange,
        step: equalizerConfig.gainStep,
        q: equalizerConfig.q,
        qs: equalizerQs,
        shelfEndpoints: equalizerConfig.shelfEndpoints,
        mount: equalizerWidget.body
    }).init();
    const offsetOpt = await new UserRangeOption({
        name:'Offset',
        storageName:'equalizer-offset',
        min:-20,
        max:20,
        step:0.1,
        default:0,
        snapToZero:0.6,
        mount:offsetMount,
        onValueChanged: value => {
            equalizer?.setOffset(value);
            bakeOffsetButton.disabled = Math.abs(value) < 0.05;
        }
    }).init();
    equalizer.bindSideControl(offsetMount);
    equalizer.setOffset(offsetOpt.getValue());
    bakeOffsetButton.disabled = Math.abs(offsetOpt.getValue()) < 0.05;
    equalizer.setEnabled(equalizerEnabled);
    equalizer.setSpectrumEnabled(initialVisualizerSettings.frequency);
    equalizerPower.addEventListener("click", () => {
        equalizerEnabled = !equalizerEnabled;
        setPowerState(equalizerPower, equalizerEnabled);
        equalizer?.setEnabled(equalizerEnabled);
        void sendSetting("equalizer-enabled", equalizerEnabled);
    });
    bakeOffsetButton.addEventListener("click", () => {
        const offset = offsetOpt.getValue();
        if (Math.abs(offset) < 0.05) return;
        equalizer?.bakeOffset(offset);
        offsetOpt.applyPresetValue(0, 0);
        bakeOffsetButton.disabled = true;
    });

    const presetManager = await new PresetManager().init();
    const reflectPreset = (preset: Preset) => {
        convolverOpt.animateToValue(preset.convolver);
        if (preset.convolver > 0) lastConvolverMix = preset.convolver;
        setPowerState(convolverPower, preset.convolver > 0);
        stereoToggle.checked = preset.stereoWidener === 0;
        offsetOpt.animateToValue(preset.offset);
        equalizer?.animateOffsetTo(preset.offset);
        bakeOffsetButton.disabled = Math.abs(preset.offset) < 0.05;
        equalizer?.animateToPresetLayout(preset.bands, preset.equalizer, preset.q, preset.shelfEndpoints);
    };
    presetManager.valueChanged = reflectPreset;

    const transferStatus = document.getElementById("preset-transfer-status")!;
    const showTransferResult = (button: HTMLButtonElement, message: string, success: boolean) => {
        transferStatus.textContent = message;
        button.title = message;
        button.classList.remove("is-success", "is-error");
        button.classList.add(success ? "is-success" : "is-error");
        window.setTimeout(() => button.classList.remove("is-success", "is-error"), 1400);
    };
    const copyButton = document.getElementById("copy-preset-button") as HTMLButtonElement;
    copyButton.addEventListener("click", async () => {
        try {
            const payload = serializePreset(presetManager.getSelectedName(), await getCurrentPreset());
            await navigator.clipboard.writeText(payload);
            showTransferResult(copyButton, "Preset copied", true);
        } catch (error) {
            showTransferResult(copyButton, "Unable to copy preset", false);
            Logger.logErr("Unable to copy preset:", error);
        }
    });
    const pasteButton = document.getElementById("paste-preset-button") as HTMLButtonElement;
    const conflictDialog = document.getElementById("preset-conflict-dialog") as HTMLDialogElement;
    const conflictCopy = document.getElementById("preset-conflict-copy")!;
    const overwriteConflict = document.getElementById("overwrite-preset-conflict") as HTMLButtonElement;
    const duplicateConflict = document.getElementById("duplicate-preset-conflict") as HTMLButtonElement;
    const requestConflictChoice = (name: string, duplicateName: string, canOverwrite: boolean): Promise<"overwrite" | "duplicate" | null> => {
        conflictCopy.textContent = canOverwrite
            ? `“${name}” already exists. Replace it, or import this preset as “${duplicateName}”?`
            : `“${name}” is built in and cannot be replaced. Import this preset as “${duplicateName}” instead?`;
        overwriteConflict.hidden = !canOverwrite;
        duplicateConflict.textContent = `Add as ${duplicateName}`;
        conflictDialog.showModal();
        return new Promise(resolve => {
            overwriteConflict.onclick = () => { conflictDialog.close(); resolve("overwrite"); };
            duplicateConflict.onclick = () => { conflictDialog.close(); resolve("duplicate"); };
            (document.getElementById("cancel-preset-conflict") as HTMLButtonElement).onclick = () => { conflictDialog.close(); resolve(null); };
            conflictDialog.oncancel = event => { event.preventDefault(); conflictDialog.close(); resolve(null); };
        });
    };
    pasteButton.addEventListener("click", async () => {
        try {
            const imported = parsePreset(await navigator.clipboard.readText());
            const presets = await getPresets();
            const base = imported.name || "Imported preset";
            let name = base;
            if (Object.hasOwn(presets, name)) {
                let suffix = 1;
                let duplicateName: string;
                do {
                    const marker = `_${suffix++}`;
                    duplicateName = `${base.slice(0, 40 - marker.length)}${marker}`;
                } while (Object.hasOwn(presets, duplicateName));
                const choice = await requestConflictChoice(name, duplicateName, !Object.hasOwn(Config.Presets, name));
                if (!choice) return;
                if (choice === "duplicate") name = duplicateName;
            }
            await savePreset(name, imported.preset);
            await applyPreset(name, imported.preset);
            await presetManager.refresh(name);
            reflectPreset(imported.preset);
            showTransferResult(pasteButton, `Imported “${name}”`, true);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to import preset";
            showTransferResult(pasteButton, message, false);
            Logger.logErr("Unable to import preset:", error);
        }
    });

    const renameButton = document.getElementById("rename-preset-button") as HTMLButtonElement;
    const renameDialog = document.getElementById("rename-preset-dialog") as HTMLDialogElement;
    const renameForm = document.getElementById("rename-preset-form") as HTMLFormElement;
    const renameInput = document.getElementById("rename-preset-name") as HTMLInputElement;
    const renameMessage = document.getElementById("rename-preset-message")!;
    renameButton.addEventListener("click", () => {
        const selected = presetManager.getSelectedName();
        if (selected === "Custom" || Object.hasOwn(Config.Presets, selected)) {
            showTransferResult(renameButton, "Only saved user presets can be renamed", false);
            return;
        }
        renameInput.value = selected;
        renameMessage.textContent = "";
        renameDialog.showModal();
        renameInput.select();
    });
    document.getElementById("cancel-rename-preset")!.addEventListener("click", () => renameDialog.close());
    renameForm.addEventListener("submit", async event => {
        event.preventDefault();
        try {
            const name = await renamePreset(presetManager.getSelectedName(), renameInput.value);
            await presetManager.refresh(name);
            renameDialog.close();
            showTransferResult(renameButton, `Renamed to “${name}”`, true);
        } catch (error) {
            renameMessage.textContent = error instanceof Error ? error.message : "Unable to rename preset.";
        }
    });

    const saveDialog = document.getElementById('save-preset-dialog') as HTMLDialogElement;
    const saveForm = document.getElementById('save-preset-form') as HTMLFormElement;
    const presetName = document.getElementById('preset-name') as HTMLInputElement;
    const presetMessage = document.getElementById('preset-message') as HTMLElement;
    document.getElementById('save-preset-button')!.addEventListener('click', () => {
        presetName.value = '';
        presetMessage.textContent = '';
        saveDialog.showModal();
        presetName.focus();
    });
    document.getElementById('cancel-save-preset')!.addEventListener('click', () => saveDialog.close());
    saveForm.addEventListener('submit', async event => {
        event.preventDefault();
        try {
            const currentPreset = await getCurrentPreset();
            const name = await savePreset(presetName.value, currentPreset);
            await presetManager.refresh(name);
            saveDialog.close();
        } catch (error) {
            presetMessage.textContent = error instanceof Error ? error.message : 'Unable to save preset.';
            Logger.logErr('Unable to save preset:', error);
        }
    });
});
