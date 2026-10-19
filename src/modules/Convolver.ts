import { AudioModule } from "./AudioModule";
import Runtime from "../util/Runtime";

export class Convolver extends AudioModule {

    readonly name = 'Convolver';

    // Storage
    private loaded = false;
    private loading: Promise<void> | null = null;
    private targetMix = 0;
    private targetTransitionMs = 0;
    private wetConnected = false;
    private disconnectTimer: number | null = null;

    // Nodes
    private dryGainNode!: GainNode;
    private wetGainNode!: GainNode;
    private convolverNode!: ConvolverNode;

    createNodes() {
        this.dryGainNode = this.audioContext.createGain();
        this.wetGainNode = this.audioContext.createGain();
        this.convolverNode = this.audioContext.createConvolver();
    }

    setupNodeRoutes() {
        this.entryNode.connect(this.dryGainNode);
        this.convolverNode.connect(this.wetGainNode);
        this.dryGainNode.connect(this.exitNode);
        this.wetGainNode.connect(this.exitNode);
    }

    async setup() {
        this.dryGainNode.gain.value = 1;
        this.wetGainNode.gain.value = 0;
    }

    async loadSample() {
        const buffer = await this.loadAudioBuffer('./content_scripts/impulse.wav');
        this.convolverNode.buffer = buffer;
    }

    async loadAudioBuffer(path: string): Promise<AudioBuffer> {
        const url = Runtime.runtime.getURL(path);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Unable to fetch impulse response (${res.status}).`);
        const arrayBuffer = await res.arrayBuffer();
        return await this.audioContext.decodeAudioData(arrayBuffer);
    }

    setMix(mix: number, transitionMs = 0) {
        this.targetMix = Math.min(1, Math.max(0, mix));
        this.targetTransitionMs = transitionMs;
        if (!this.loaded) {
            if (this.targetMix > 0 && !this.loading) {
                this.loading = this.loadSample().then(() => {
                    this.loaded = true;
                    this.loading = null;
                    this.applyMix(this.targetMix, Math.max(this.targetTransitionMs, 120));
                }).catch(error => {
                    this.loading = null;
                    console.error('[Emberline] Unable to load convolution sample:', error);
                });
            }
            return;
        }
        this.applyMix(this.targetMix, transitionMs);
    }

    private applyMix(clamped: number, transitionMs: number): void {
        if (this.disconnectTimer !== null) {
            window.clearTimeout(this.disconnectTimer);
            this.disconnectTimer = null;
        }
        if (clamped > 0 && !this.wetConnected) {
            this.entryNode.connect(this.convolverNode);
            this.wetConnected = true;
        }
        for (const [parameter, value] of [[this.dryGainNode.gain, 1 - clamped], [this.wetGainNode.gain, clamped]] as const) {
            this.setParameterValue(parameter, value, transitionMs);
        }
        if (clamped === 0 && this.wetConnected) {
            const disconnect = () => {
                if (this.targetMix !== 0 || !this.wetConnected) return;
                this.entryNode.disconnect(this.convolverNode);
                this.wetConnected = false;
                this.disconnectTimer = null;
            };
            if (transitionMs > 0) this.disconnectTimer = window.setTimeout(disconnect, transitionMs);
            else disconnect();
        }
    }

}
