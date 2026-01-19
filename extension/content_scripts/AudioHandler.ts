import { AudioModule } from "./modules/AudioModule";
import { Equalizer } from "./modules/Equalizer";
import { Convolver } from "./modules/Convolver";
import { FrequencyAnalyser } from "./modules/FrequencyAnalyser";
import { WaveformAnalyser } from "./modules/WaveformAnalyser";
import { StereoWidener } from "./modules/StereoWidener";
import { Volume } from "./modules/Volume";
import { Logger } from "./Logger";
import Runtime from "./Runtime";

export class AudioHandler {

    // Storage
    audioContext = new AudioContext();
    last_node!: AudioNode|AudioModule;

    // Nodes
    entryNode!: GainNode;
    equalizer = new Equalizer();
    convolver = new Convolver();
    freqAnalyser = new FrequencyAnalyser();
    waveAnalyser = new WaveformAnalyser();
    stereoWidener = new StereoWidener();
    volume = new Volume();

    async init() {

        Logger.log('Initializing AudioHandler');

        // Initial Setup
        this.entryNode = this.audioContext.createGain();
        this.entryNode.connect(this.audioContext.destination);
        this.last_node = this.entryNode;

        // Load Plugins
        await this.loadPlugin(this.equalizer);
        await this.loadPlugin(this.convolver);
        await this.loadPlugin(this.stereoWidener);
        await this.loadPlugin(this.volume);
        await this.loadPlugin(this.freqAnalyser);
        await this.loadPlugin(this.waveAnalyser);

        await this.handleUserSettings();
        
    }

    async ensureRunning() {
        if (this.audioContext.state === 'suspended') await this.audioContext.resume();
    }

    async attach(media: HTMLMediaElement) {

        Logger.log('Attaching to media source.');

        this.ensureRunning();

        const src = media.currentSrc || media.src;
        const isCrossOrigin = (() => {
            try { return src && new URL(src, location.href).origin !== location.origin; }
            catch { return false; }
        })();

        if (isCrossOrigin) {
            Logger.log('CORS detected. I don\'t feel like fixing this so we are rejecting the attachment.');
            return;
        }

        try {
            const node = this.audioContext.createMediaElementSource(media);
            node.connect(this.entryNode);
            Logger.log('Successfully ran createMediaElementSource(). Life is good!')
        } catch {
            Logger.log('createMediaElementSource failed, attempting captureStream fallback.');
            const capture = (media as any).captureStream || (media as any).mozCaptureStream;
            if (typeof capture !== 'function') return false;
            try {
                const stream = capture.call(media);
                const node = this.audioContext.createMediaStreamSource(stream);
                node.connect(this.entryNode);
                Logger.log('Successfully ran captureStream. Suck it CORS');
                return true;
            } catch {
                return false;
            }
        }

    }

    async handleUserSettings() {

        // Load settings from local storage.
        const keys = ['convolver_mix', 'stereo_seperation', 'pre-amp', ...this.equalizer.eqBands.map(b => `band-${b}`)];
        const result = await Runtime.storage.local.get(keys);
        for (const [key, value] of Object.entries(result)) {
            switch(key) {
                case 'convolver_mix':
                    this.convolver.setMix(value);
                    break;
                
                case 'stereo_seperation':
                    this.stereoWidener.setSeparation(value);
                    break;

                case 'pre-amp':
                    this.volume.setVolume(value);
                    break;

                default:
                    if (key.startsWith('band-') && typeof value === 'number') {
                        const freq = parseInt(key.replace('band-', ''), 10);
                        const index = this.equalizer.eqBands.indexOf(freq);
                        this.equalizer.setFrequencyGain(index, value);
                    }
                    break;
            }
        }

        // Listen for setting update messages from the GUI.
        Runtime.runtime.onMessage.addListener(message => {
            Logger.log('GUI Message: ', message);
            switch(message.action) {
                case 'set-convolver_mix':
                    this.convolver.setMix(message.value);
                    break;
                case 'set-pre-amp':
                    this.volume.setVolume(message.value);
                    break;
                case 'set-stereo_seperation':
                    this.stereoWidener.setSeparation(message.value);
                    break;
                default: 
                    if (message.action.startsWith('set-band-')) {
                        const freq = parseInt(message.action.replace('set-band-', ''), 10);
                        const index = this.equalizer.eqBands.indexOf(freq);
                        this.equalizer.setFrequencyGain(index, message.value);
                    }
                    break;
            }

        });

    }

    async loadPlugin(plugin:AudioModule) {

        Logger.log(`Loading Plugin: ${plugin.name}`);
        try {
            await plugin.init(this.audioContext);
            this.last_node.disconnect(this.audioContext.destination);
            this.last_node.connect(plugin.entry);
            plugin.connect(this.audioContext.destination);
            this.last_node = plugin;
        } catch(e) {
            Logger.logErr(`Failed to load plugin: ${plugin.name}\nReason: ${e}`);
        }
        
    }

}