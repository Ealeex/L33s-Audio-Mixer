import { AudioModule } from "../modules/AudioModule";
import { Equalizer } from "../modules/Equalizer";
import { Convolver } from "../modules/Convolver";
import { FrequencyAnalyser } from "../modules/FrequencyAnalyser";
import { WaveformAnalyser } from "../modules/WaveformAnalyser";
import { StereoWidener } from "../modules/StereoWidener";
import { Logger } from "../util/Logger";
import { StorageManager } from "../util/StorageManager";
import Runtime from "../util/Runtime";
import { getEqualizerBands, getEqualizerConfig, getEqualizerQs } from "../util/EqualizerSettings";

export class AudioHandler {
    private static readonly visualizerPortName = 'audio-visualizer';
    private static visualizerSettings = { frequency: true, waveform: true };

    // Storage
    static audioContext = new AudioContext();
    static last_node: AudioNode | AudioModule;
    static attached = new WeakSet<HTMLMediaElement>();

    // Nodes
    static entryNode: GainNode;
    static modules: Map<string, AudioModule> = new Map();
    private static isInitialized = false;

    /** Initializes the audio system and loads all plugins */
    static async init() {

        if(AudioHandler.isInitialized) return;

        Logger.log('Initializing AudioHandler');

        // Initial Setup
        AudioHandler.entryNode = AudioHandler.audioContext.createGain();
        AudioHandler.entryNode.connect(AudioHandler.audioContext.destination);
        AudioHandler.last_node = AudioHandler.entryNode;

        // Load Plugins
        const equalizerBands = await getEqualizerBands();
        const equalizerConfig = await getEqualizerConfig();
        const equalizerQs = await getEqualizerQs(equalizerBands.length, equalizerConfig.q);
        await AudioHandler.loadPlugin('sourceFreqAnalyser', new FrequencyAnalyser());
        await AudioHandler.loadPlugin('equalizer', new Equalizer(equalizerBands, equalizerConfig, equalizerQs));
        await AudioHandler.loadPlugin('convolver', new Convolver());
        await AudioHandler.loadPlugin('freqAnalyser', new FrequencyAnalyser());
        await AudioHandler.loadPlugin('waveAnalyser', new WaveformAnalyser());
        await AudioHandler.loadPlugin('stereoWidener', new StereoWidener());

        // Setup Communication
        await AudioHandler.setupIPC();
        await AudioHandler.setupVisualizerStream();
        AudioHandler.isInitialized = true;
    }

    /** Ensures the audio context is running */
    static async ensureRunning() {
        if (AudioHandler.audioContext.state === 'suspended') {
            await AudioHandler.audioContext.resume();
        }
    }

    /** Attaches the audio handler to a media element */
    static async attachOnce(media: HTMLMediaElement) {

        if(AudioHandler.attached.has(media)) return;
        AudioHandler.attached.add(media);

        Logger.log('Attaching to media source.');

        await AudioHandler.ensureRunning();

        const src = media.currentSrc || media.src;
        const isCrossOrigin = (() => {
            try { return src && new URL(src, location.href).origin !== location.origin; }
            catch { return false; }
        })();

        if (isCrossOrigin) {
            Logger.log('CORS detected. Attachment rejected.');
            return;
        }

        try {
            const node = AudioHandler.audioContext.createMediaElementSource(media);
            node.connect(AudioHandler.entryNode);
            Logger.log('Successfully created MediaElementSource.');
        } catch {
            Logger.log('createMediaElementSource failed, attempting captureStream fallback.');
            const capture = (media as any).captureStream || (media as any).mozCaptureStream;
            if (typeof capture !== 'function') return false;
            try {
                const stream = capture.call(media);
                const node = AudioHandler.audioContext.createMediaStreamSource(stream);
                node.connect(AudioHandler.entryNode);
                Logger.log('Successfully ran captureStream fallback.');
                return true;
            } catch { return false; }
        }
    }

    /** Sets up subscriptions for IPC / StorageManager */
    static async setupIPC() {
        StorageManager.subscribe('convolver_mix', 0, (value: number, message) => {
            (AudioHandler.modules.get('convolver') as Convolver).setMix(value, message?.transitionMs);
        });
        StorageManager.subscribe('stereo_seperation', 1, (value: number, message) => {
            (AudioHandler.modules.get('stereoWidener') as StereoWidener).setSeparation(value, message?.transitionMs);
        });
        const bands = await getEqualizerBands();
        const equalizerConfig = await getEqualizerConfig();
        StorageManager.subscribe('equalizer-bands', bands, (value: number[]) => {
            (AudioHandler.modules.get('equalizer') as Equalizer).setBands(value);
        });
        const equalizerQs = await getEqualizerQs(bands.length, equalizerConfig.q);
        StorageManager.subscribe('equalizer-qs', equalizerQs, (value: number[]) => {
            (AudioHandler.modules.get('equalizer') as Equalizer).setBandQs(value);
        });
        StorageManager.subscribe('equalizer-config', equalizerConfig, value => {
            (AudioHandler.modules.get('equalizer') as Equalizer).setConfig(value);
        });
        StorageManager.subscribe('equalizer', Array(bands.length).fill(0), (value: number[], message) => {
            (AudioHandler.modules.get('equalizer') as Equalizer).setBandGains(value, message?.transitionMs);
        });
        StorageManager.subscribe('equalizer-enabled', true, (value: boolean, message) => {
            (AudioHandler.modules.get('equalizer') as Equalizer).setEnabled(value, message?.transitionMs);
        });
        StorageManager.subscribe('equalizer-offset', 0, (value: number, message) => {
            (AudioHandler.modules.get('equalizer') as Equalizer).setOffset(value, message?.transitionMs);
        });
    }

    private static async setupVisualizerStream() {
        const result = await Runtime.storage.local.get('visualizer-settings');
        const settings = result['visualizer-settings'];
        if (settings && typeof settings === 'object') {
            AudioHandler.visualizerSettings = {
                frequency: settings.frequency !== false,
                waveform: settings.waveform !== false
            };
        }
        Runtime.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local' || !changes['visualizer-settings']) return;
            const settings = changes['visualizer-settings'].newValue;
            if (!settings || typeof settings !== 'object') return;
            AudioHandler.visualizerSettings = {
                frequency: settings.frequency !== false,
                waveform: settings.waveform !== false
            };
        });

        Runtime.runtime.onConnect.addListener(port => {
            if (port.name !== AudioHandler.visualizerPortName) return;

            const frequencyAnalyser = AudioHandler.modules.get('freqAnalyser') as FrequencyAnalyser | undefined;
            const sourceFrequencyAnalyser = AudioHandler.modules.get('sourceFreqAnalyser') as FrequencyAnalyser | undefined;
            const waveformAnalyser = AudioHandler.modules.get('waveAnalyser') as WaveformAnalyser | undefined;
            if (!frequencyAnalyser || !sourceFrequencyAnalyser || !waveformAnalyser) {
                const error = new Error('Visualizer analyzers are unavailable.');
                Logger.logErr(error);
                port.disconnect();
                return;
            }

            const intervalId = window.setInterval(() => {
                if (document.visibilityState !== 'visible'
                    || (!AudioHandler.visualizerSettings.frequency && !AudioHandler.visualizerSettings.waveform)) return;
                port.postMessage({
                    frequency: AudioHandler.visualizerSettings.frequency ? frequencyAnalyser.getVisualData() : null,
                    sourceFrequency: AudioHandler.visualizerSettings.frequency ? sourceFrequencyAnalyser.getVisualData() : null,
                    waveform: AudioHandler.visualizerSettings.waveform ? waveformAnalyser.getVisualData() : null,
                    frequencyMinimum: FrequencyAnalyser.visualMinimumFrequency,
                    frequencyMaximum: FrequencyAnalyser.visualMaximumFrequency,
                    sampleRate: AudioHandler.audioContext.sampleRate
                });
            }, 1000 / 144);

            port.onDisconnect.addListener(() => window.clearInterval(intervalId));
        });
    }

    /** Loads a plugin into the audio chain */
    static async loadPlugin(name: string, plugin: AudioModule) {

        if(AudioHandler.modules.has(name)) return Logger.logErr(`Can't create module '${name}'. Module with that name already exist.`);

        Logger.log(`Loading Plugin: ${plugin.name}`);
        try {
            await plugin.init(AudioHandler.audioContext);

            AudioHandler.last_node.disconnect(AudioHandler.audioContext.destination);
            AudioHandler.last_node.connect(plugin.entry);
            plugin.connect(AudioHandler.audioContext.destination);

            AudioHandler.last_node = plugin;
            AudioHandler.modules.set(name, plugin);
        } catch (e) {
            Logger.logErr(`Failed to load plugin: ${plugin.name}\nReason: ${e}`);
        }
    }
    
}
