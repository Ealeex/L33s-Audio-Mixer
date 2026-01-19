const _log = (...data:any[]) => console.log(`[LeeAudio]`, ...data);
const _logErr = (...data:any[]) => console.error(`[LeeAudio]`, ...data);

const runtime = typeof browser !== "undefined" ? browser : chrome;

interface INode {
  readonly name: string;
  init(audioContext: AudioContext): Promise<void> | void;
  connect(node: AudioNode): void;
  disconnect(node: AudioNode): void;
  get entry(): AudioNode;
}

abstract class AudioModule implements INode {
  abstract readonly name: string;
  protected audioContext!: AudioContext;
  protected entryNode!: GainNode;
  protected exitNode!: GainNode;

  async init(audioContext: AudioContext) {
    if (this.audioContext) return;

    this.audioContext = audioContext;
    this.entryNode = audioContext.createGain();
    this.exitNode = audioContext.createGain();

    this.createNodeTree();
    this.setupNodeRoutes();
    await this.setup();
  }

  connect(node: AudioNode) { this.exitNode.connect(node); }
  disconnect(node: AudioNode) { this.exitNode.disconnect(node); }

  protected createNodeTree() {}
  protected setupNodeRoutes() {
    this.entryNode.connect(this.exitNode);
  }
  protected async setup() {}

  get entry(): AudioNode {
    return this.entryNode;
  }
}

class Equalizer extends AudioModule {

    readonly name = 'Equalizer';

    // Config
    readonly eqBands = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000];
    
    // Nodes
    private eqBandNodes: BiquadFilterNode[] = [];

    protected async setup() {
        
        // Generate Nodes
        if (this.eqBands.length === 0) throw new Error('Equalizer has no bands');
        let previous: BiquadFilterNode | null = null;
        for (const freq of this.eqBands) {
            const node = this.createEQNode(freq);
            if (previous) previous.connect(node);
            previous = node;
        }
        this.eqBandNodes[0].type = 'lowshelf';
        this.eqBandNodes[this.eqBandNodes.length - 1].type = 'highshelf';

        // Setup for the _Node Interface
        this.entryNode.connect(this.eqBandNodes[0]);
        this.eqBandNodes[this.eqBandNodes.length - 1].connect(this.exitNode);
    }

    private createEQNode(frequency: number, Q = 1.0) {
        const band = this.audioContext.createBiquadFilter();
        band.frequency.value = frequency;
        band.type = 'peaking';
        band.Q.value = Q;
        band.gain.value = 0;
        this.eqBandNodes.push(band);
        return band;
    }

    setFrequencyGain(index: number, gain: number) {
        if (!Number.isFinite(gain)) return;
        if (index < 0 || index >= this.eqBandNodes.length) return;
        this.eqBandNodes[index].gain.value = gain;
    }

}

class WaveformAnalyser extends AudioModule {

    readonly name = 'Waveform_Analyser';
    
    // Config
    private fftSize = 2048;

    // Storage
    private isVisible = true;
    private data!: Float32Array;

    // Nodes
    private analyserNode!: AnalyserNode;

    protected createNodeTree() {
        this.analyserNode = this.audioContext.createAnalyser();
    }

    protected setupNodeRoutes() {
        this.entryNode.connect(this.analyserNode);
        this.analyserNode.connect(this.exitNode);
    }

    protected async setup() {
        this.isVisible = document.visibilityState === 'visible';
        document.addEventListener('visibilitychange', () => {
            this.isVisible = document.visibilityState === 'visible';
        });

        this.analyserNode.fftSize = this.fftSize;
        this.analyserNode.smoothingTimeConstant = 1; // built-in smoothing

        this.data = new Float32Array(this.analyserNode.fftSize);

        window.setInterval(() => {
            if (!this.isVisible) return;
            (this.analyserNode.getFloatTimeDomainData as unknown as
                (array: Float32Array) => void)(this.data);
            this.sendWaveformData();
        }, Math.round(1000 / 144));
    }

    private sendWaveformData() {
        runtime.storage.local.set({
            waveformData: Array.from(this.data)
        });
    }

}

class FrequencyAnalyser extends AudioModule {

    readonly name = 'Frequency_Analyser';

    // Config
    private fftSize = 16384;
    private visualBinCount = 256;

    // Storage
    private isVisible = true;
    private data!: Float32Array;

    // Nodes
    analyserNode!: AnalyserNode;  

    protected createNodeTree() {
        this.analyserNode = this.audioContext.createAnalyser();
    }

    protected setupNodeRoutes() {
        this.entryNode.connect(this.analyserNode);
        this.analyserNode.connect(this.exitNode);
    }

    protected async setup() {

        // Visibililty
        this.isVisible = document.visibilityState === 'visible';
        document.addEventListener('visibilitychange', () => {
            this.isVisible = document.visibilityState === 'visible';
        });

        this.analyserNode.fftSize = this.fftSize;
        this.analyserNode.minDecibels = -100;
        this.analyserNode.maxDecibels = -30;
        this.analyserNode.smoothingTimeConstant = 0.25;

        this.data = new Float32Array(this.analyserNode.frequencyBinCount);

        window.setInterval(() => {
            if(!this.isVisible) return;
            (this.analyserNode.getFloatFrequencyData as unknown as
                (array: Float32Array) => void)(this.data);
            this.sendAnalyserData_FreqDomain();
        }, Math.round(1000 / 144));

    }

    private sendAnalyserData_FreqDomain() {
        const logData = this.getLogFrequencyData(this.visualBinCount);
        runtime.storage.local.set({ analyserData: Array.from(logData) });
    }

    private getLogFrequencyData(logBinCount: number): Float32Array {
        const output = new Float32Array(logBinCount);

        const sampleRate = this.audioContext.sampleRate;
        const nyquist = sampleRate / 2;

        // ---- VISUAL TUNING ----
        const minFreq = 30;
        const maxFreq = 12000;
        const minDb = -100;

        const logMin = Math.log10(minFreq);
        const logMax = Math.log10(maxFreq);

        const binCount = this.data.length;
        const hzPerBin = nyquist / binCount;

        for (let i = 0; i < logBinCount; i++) {
            const t0 = i / logBinCount;
            const t1 = (i + 1) / logBinCount;

            const f0 = 10 ** (logMin + t0 * (logMax - logMin));
            const f1 = 10 ** (logMin + t1 * (logMax - logMin));

            let binStart = Math.floor(f0 / hzPerBin);
            let binEnd   = Math.ceil (f1 / hzPerBin);

            binStart = Math.max(0, binStart);
            binEnd   = Math.min(binCount - 1, binEnd);

            let max = minDb;
            let sum = 0;
            let count = 0;

            for (let b = binStart; b <= binEnd; b++) {
                const v = this.data[b];
                if (v > max) max = v;
                sum += v;
                count++;
            }

            const avg = count > 0 ? sum / count : minDb;

            // Punch + stability
            let value = max * 0.7 + avg * 0.3;

            // Visual bass lift
            const freqCenter = Math.sqrt(f0 * f1);
            const bassBoost = Math.pow(1 - Math.log(freqCenter / maxFreq), 0.6);

            value += Math.max(-30, 20 * Math.log10(bassBoost));

            output[i] = isFinite(value) ? value : minDb;
        }

        return output;
    }

}

class Convolver extends AudioModule {

    readonly name = 'Convolver';

    // Storage
    private loaded = false;

    // Nodes
    private dryGainNode!: GainNode;
    private wetGainNode!: GainNode;
    private convolverNode!: ConvolverNode;

    createNodeTree() {
        this.dryGainNode = this.audioContext.createGain();
        this.wetGainNode = this.audioContext.createGain();
        this.convolverNode = this.audioContext.createConvolver();
    }

    setupNodeRoutes() {
        this.entryNode.connect(this.dryGainNode);
        this.entryNode.connect(this.convolverNode);
        this.convolverNode.connect(this.wetGainNode);
        this.dryGainNode.connect(this.exitNode);
        this.wetGainNode.connect(this.exitNode);
    }

    async setup() {
        this.dryGainNode.gain.value = 1;
        this.wetGainNode.gain.value = 0;
        await this.loadSample();
        this.loaded = true;
        this.setMix(0.5);
    }

    async loadSample() {
        const buffer = await this.loadAudioBuffer('./content_scripts/impulse.wav');
        this.convolverNode.buffer = buffer;
    }

    async loadAudioBuffer(path: string): Promise<AudioBuffer> {
        const url = runtime.runtime.getURL(path);
        const res = await fetch(url);
        const arrayBuffer = await res.arrayBuffer();
        return await this.audioContext.decodeAudioData(arrayBuffer);
    }

    setMix(mix: number) {
        if (!this.loaded) return;
        const clamped = Math.min(1, Math.max(0, mix));
        this.dryGainNode.gain.value = 1 - clamped;
        this.wetGainNode.gain.value = clamped;
    }

}

class StereoWidener extends AudioModule {

    readonly name = 'Stereo Widener';

    // Nodes
    private sideScaler!: GainNode;
    private splitter!: ChannelSplitterNode;
    private mid!: GainNode;
    private side!: GainNode;
    private leftGainMid!: GainNode;
    private rightGainMid!: GainNode;
    private leftGainSide!: GainNode;
    private rightGainSide!: GainNode;
    private leftOut!: GainNode;
    private rightOut!: GainNode;
    private invertSide!: GainNode;
    private merger!: ChannelMergerNode;

    protected  createNodeTree(): void {
        this.splitter = this.audioContext.createChannelSplitter(2);
        this.mid = this.audioContext.createGain();
        this.side = this.audioContext.createGain();
        this.leftGainMid = this.audioContext.createGain();
        this.rightGainMid = this.audioContext.createGain();
        this.leftGainSide = this.audioContext.createGain();
        this.rightGainSide = this.audioContext.createGain();
        this.sideScaler = this.audioContext.createGain();
        this.leftOut = this.audioContext.createGain();
        this.rightOut = this.audioContext.createGain();
        this.invertSide = this.audioContext.createGain();
        this.merger = this.audioContext.createChannelMerger(2);
    }

    protected  setupNodeRoutes(): void {
        this.splitter.connect(this.leftGainMid, 0);
        this.splitter.connect(this.rightGainMid, 1);
        this.leftGainMid.connect(this.mid);
        this.rightGainMid.connect(this.mid);
        this.splitter.connect(this.leftGainSide, 0);
        this.splitter.connect(this.rightGainSide, 1);
        this.leftGainSide.connect(this.side);
        this.rightGainSide.connect(this.side);
        this.side.connect(this.sideScaler);
        this.mid.connect(this.leftOut);
        this.sideScaler.connect(this.leftOut);
        this.mid.connect(this.rightOut);
        this.sideScaler.connect(this.invertSide);
        this.invertSide.connect(this.rightOut);
        this.leftOut.connect(this.merger, 0, 0);
        this.rightOut.connect(this.merger, 0, 1);
        this.entryNode.connect(this.splitter);
        this.merger.connect(this.exitNode);
    }

    protected  async setup() {
        this.leftGainMid.gain.value = 0.5;
        this.rightGainMid.gain.value = 0.5;
        this.leftGainSide.gain.value = 0.5;
        this.rightGainSide.gain.value = -0.5;
        this.sideScaler.gain.value = 1;
        this.invertSide.gain.value = -1;
    }

    setSeparation(sep: number) {
        this.sideScaler.gain.value = sep;
    }

}

class Volume extends AudioModule {
    readonly name = 'Pre-Amplifier';
    setVolume(vol: number) { this.entryNode.gain.value = vol; }
}

class AudioHandler {

    // Storage
    audioContext = new AudioContext();
    last_node!: AudioNode|AudioModule;
    private attached = new Set<HTMLMediaElement>();

    // Nodes
    entryNode!: GainNode;
    equalizer = new Equalizer();
    convolver = new Convolver();
    freqAnalyser = new FrequencyAnalyser();
    waveAnalyser = new WaveformAnalyser();
    stereoWidener = new StereoWidener();
    volume = new Volume();

    async init() {

        _log('Initializing AudioHandler');

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

        if (this.attached.has(media)) return;

        _log('Attaching to media source.');

        this.ensureRunning();

        const src = media.currentSrc || media.src;
        const isCrossOrigin = (() => {
            try { return src && new URL(src, location.href).origin !== location.origin; }
            catch { return false; }
        })();

        if (isCrossOrigin) {
            _log('CORS detected. I don\'t feel like fixing this so we are rejecting the attachment.');
            return;
        }

        try {
            const node = this.audioContext.createMediaElementSource(media);
            node.connect(this.entryNode);
            this.attached.add(media);
            _log('Successfully ran createMediaElementSource(). Life is good!')
        } catch {
            _log('createMediaElementSource failed, attempting captureStream fallback.');
            const capture = (media as any).captureStream || (media as any).mozCaptureStream;
            if (typeof capture !== 'function') return false;
            try {
                const stream = capture.call(media);
                const node = this.audioContext.createMediaStreamSource(stream);
                node.connect(this.entryNode);
                this.attached.add(media);
                _log('Successfully ran captureStream. Suck it CORS');
                return true;
            } catch {
                return false;
            }
        }

    }

    async handleUserSettings() {

        // Load settings from local storage.
        const keys = ['convolver_mix', 'stereo_seperation', 'pre-amp', ...this.equalizer.eqBands.map(b => `band-${b}`)];
        const result = await runtime.storage.local.get(keys);
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
        runtime.runtime.onMessage.addListener(message => {
            _log('GUI Message: ', message);
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
        _log(`Loading Plugin: ${plugin.name}`);
        try {
            await plugin.init(this.audioContext);
            this.last_node.disconnect(this.audioContext.destination);
            this.last_node.connect(plugin.entry);
            plugin.connect(this.audioContext.destination);
            this.last_node = plugin;
        } catch(e) {
            _logErr(`Failed to load plugin: ${plugin.name}\nReason: ${e}`);
        }
    }

}

(async() => {

    if(location.hostname === 'open.spotify.com') _log('Spotify detected — audio processing disabled (DRM-protected)');

    const handler = new AudioHandler();
    await handler.init();

    window.addEventListener('play', e => { if (e.target instanceof HTMLMediaElement) handler.attach(e.target);}, true);

    const originalPlay = Audio.prototype.play;
    Audio.prototype.play = function (...args: any) {
        handler.attach(this);
        originalPlay.apply(this, args as any);
    };

})();