import { AudioModule } from "./AudioModule";
import Runtime from "../Runtime";

export class Convolver extends AudioModule {

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
        const url = Runtime.runtime.getURL(path);
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