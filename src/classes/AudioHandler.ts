import { AudioModule } from "../modules/AudioModule";
import { Equalizer } from "../modules/Equalizer";
import { Convolver } from "../modules/Convolver";
import { FrequencyAnalyser } from "../modules/FrequencyAnalyser";
import { WaveformAnalyser } from "../modules/WaveformAnalyser";
import { StereoWidener } from "../modules/StereoWidener";
import { Volume } from "../modules/Volume";
import { Logger } from "../util/Logger";
import { StorageManager } from "../classes/StorageManager";

export class AudioHandler {

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
        await AudioHandler.loadPlugin('equalizer', new Equalizer());
        await AudioHandler.loadPlugin('convolver', new Convolver());
        await AudioHandler.loadPlugin('freqAnalyser', new FrequencyAnalyser());
        await AudioHandler.loadPlugin('waveAnalyser', new WaveformAnalyser());
        await AudioHandler.loadPlugin('stereoWidener', new StereoWidener());
        await AudioHandler.loadPlugin('volume', new Volume());

        // Setup Communication
        await AudioHandler.setupIPC();
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
        // Settings
        StorageManager.subscribe('convolver_mix', 0, (value: number) => {
            (AudioHandler.modules.get('convolver') as Convolver).setMix(value);
        });
        StorageManager.subscribe('stereo_seperation', 1, (value: number) => {
            (AudioHandler.modules.get('stereoWidener') as StereoWidener).setSeparation(value);
        });
        StorageManager.subscribe('pre-amp', 1, (value: number) => {
            (AudioHandler.modules.get('volume') as Volume).setVolume(value);
        });

        // Equalizer
        const eq = AudioHandler.modules.get('equalizer') as Equalizer;
        if (eq) {
            for (let i = 0; i < eq.eqBands.length; i++) {
                const freq = eq.eqBands[i];
                const key = `band-${freq}`;
                StorageManager.subscribe(key, 0, (value: number) => eq.setFrequencyGain(i, value));
            }
        }
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
