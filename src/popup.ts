import { UserRangeOption } from "./ui/UserRangeOption";
import { WebEqualizer } from "./ui/WebEqualizer";
import { FrequencyDisplay } from "./ui/FrequencyDisplay";
import { WaveformDisplay } from "./ui/WaveformDisplay";
import { PresetManager } from "./ui/PresetManager";
import { Logger } from "./util/Logger";
import { Preset } from "./Config";
import Runtime from "./util/Runtime";
import { getCurrentPreset, savePreset } from "./util/PresetStore";
import { getEqualizerBands, getEqualizerConfig } from "./util/EqualizerSettings";

type VisualizerSettings = { frequency: boolean; waveform: boolean };

function isVisualizerData(message: object): message is { frequency: number[] | null; waveform: number[] | null } {
    return 'frequency' in message
        && (message.frequency === null || (Array.isArray(message.frequency) && message.frequency.every(value => typeof value === 'number')))
        && 'waveform' in message
        && (message.waveform === null || (Array.isArray(message.waveform) && message.waveform.every(value => typeof value === 'number')));
}

document.addEventListener('DOMContentLoaded', async() => {
    Logger.log("Initializing Popup");

    const frequencyDisplay = new FrequencyDisplay();
    const waveformDisplay = new WaveformDisplay();
    let visualizerPort: ReturnType<typeof Runtime.tabs.connect> | null = null;
    let activeTabId: number | undefined;

    const setVisualizerSettings = (settings: VisualizerSettings) => {
        frequencyDisplay.canvas.hidden = !settings.frequency;
        waveformDisplay.canvas.hidden = !settings.waveform;
        if (settings.frequency || settings.waveform) {
            if (visualizerPort || activeTabId == null) return;
            try {
                const port = Runtime.tabs.connect(activeTabId, { name: 'audio-visualizer' });
                visualizerPort = port;
                port.onMessage.addListener((message: object) => {
                    if (!isVisualizerData(message)) return;
                    if (message.frequency) frequencyDisplay.draw(message.frequency);
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

    const volumeOpt = await new UserRangeOption({name:'Pre-amp', min:0, max:2, step:0.01, default:1}).init();
    const convolverOpt = await new UserRangeOption({name:'Convolver Mix', step:0.1}).init();
    const stereoWidthOpt = await new UserRangeOption({name:'Stereo Separation', storageName:'stereo_seperation', min:0, default:1, max:5, step:1}).init();
    const equalizerBands = await getEqualizerBands();
    const equalizerConfig = await getEqualizerConfig();
    const equalizer = await new WebEqualizer({
        bands: equalizerBands,
        min: -equalizerConfig.gainRange,
        max: equalizerConfig.gainRange,
        step: equalizerConfig.gainStep
    }).init();

    const presetManager = await new PresetManager().init();
    presetManager.valueChanged = (preset: Preset) => {
        convolverOpt.animateToValue(preset.convolver);
        stereoWidthOpt.animateToValue(preset.stereoWidener);
        equalizer.animateToValue(preset.equalizer);
    };

    document.getElementById('options-button')!.addEventListener('click', async () => {
        try {
            await Runtime.runtime.openOptionsPage();
        } catch (error) {
            Logger.logErr('Unable to open extension settings:', error);
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
