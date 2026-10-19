import { AudioModule } from "./AudioModule";
import { EqualizerConfig } from "../util/EqualizerSettings";

export class Equalizer extends AudioModule {

    readonly name = 'Equalizer';

    // Config
    private eqBands: number[];
    // Nodes
    private eqBandNodes: BiquadFilterNode[] = [];
    private config: EqualizerConfig;
    private bandQs: number[];
    private bandGains: number[] = [];
    private enabled = true;
    private offsetDb = 0;
    private masterGainNode!: GainNode;

    constructor(bands: number[], config: EqualizerConfig, bandQs: number[]) {
        super();
        this.eqBands = [...bands];
        this.config = { ...config };
        this.bandQs = this.eqBands.map((_, index) => bandQs[index] ?? config.q);
    }

    protected createNodes(): void {
        this.masterGainNode = this.audioContext.createGain();
    }

    /** The EQ builds its serial filter route in setup; no parallel dry path. */
    protected setupNodeRoutes(): void {
        this.masterGainNode.connect(this.exitNode);
    }

    protected async setup() {
        
        // Generate Nodes
        if (this.eqBands.length === 0) throw new Error('Equalizer has no bands');
        let previous: BiquadFilterNode | null = null;
        for (const [index, freq] of this.eqBands.entries()) {
            const node = this.createEQNode(freq, this.bandQs[index]);
            if (previous) previous.connect(node);
            previous = node;
        }
        this.applyFilterTypes();

        // Setup for the _Node Interface
        this.entryNode.connect(this.eqBandNodes[0]);
        this.eqBandNodes[this.eqBandNodes.length - 1].connect(this.masterGainNode);
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

    private applyFilterTypes(): void {
        this.eqBandNodes.forEach(node => node.type = "peaking");
        if (this.config.shelfEndpoints && this.eqBandNodes.length >= 2) {
            this.eqBandNodes[0].type = "lowshelf";
            this.eqBandNodes[this.eqBandNodes.length - 1].type = "highshelf";
        }
    }

    setConfig(config: EqualizerConfig): void {
        this.config = { ...config };
        this.applyFilterTypes();
    }

    setBands(bands: number[], gains: number[] = []): void {
        if (bands.length === 0) return;
        if (bands.length === this.eqBandNodes.length) {
            this.eqBands = [...bands];
            const now = this.audioContext.currentTime;
            this.eqBandNodes.forEach((node, index) => {
                node.frequency.cancelScheduledValues(now);
                node.frequency.setTargetAtTime(bands[index], now, .018);
            });
            if (gains.length) this.setBandGains(gains);
            return;
        }
        this.entryNode.disconnect();
        this.eqBandNodes.forEach(node => node.disconnect());
        this.eqBandNodes = [];
        this.eqBands = [...bands];
        let previous: BiquadFilterNode | null = null;
        this.bandQs = bands.map((_, index) => this.bandQs[index] ?? this.config.q);
        for (const [index, frequency] of bands.entries()) {
            const node = this.createEQNode(frequency, this.bandQs[index]);
            if (previous) previous.connect(node);
            previous = node;
        }
        this.applyFilterTypes();
        this.entryNode.connect(this.eqBandNodes[0]);
        this.eqBandNodes[this.eqBandNodes.length - 1].connect(this.masterGainNode);
        this.setBandGains(gains);
    }

    setBandGains(value: number[], transitionMs = 0) {
        this.bandGains = this.eqBands.map((_, index) => Number.isFinite(value[index]) ? value[index] : 0);
        for(const [index, node] of this.eqBandNodes.entries()) {
            const gain = this.enabled ? this.bandGains[index] : 0;
            this.setParameterValue(node.gain, gain, transitionMs);
        }
    }

    setEnabled(enabled: boolean, transitionMs = 0): void {
        this.enabled = enabled;
        for (const [index, node] of this.eqBandNodes.entries()) {
            this.setParameterValue(node.gain, enabled ? (this.bandGains[index] ?? 0) : 0, transitionMs);
        }
        this.setParameterValue(this.masterGainNode.gain, enabled ? this.dbToGain(this.offsetDb) : 1, transitionMs);
    }

    setOffset(offsetDb: number, transitionMs = 0): void {
        this.offsetDb = Math.max(-20, Math.min(20, offsetDb));
        if (this.enabled) this.setParameterValue(this.masterGainNode.gain, this.dbToGain(this.offsetDb), transitionMs);
    }

    private dbToGain(decibels: number): number {
        return Math.pow(10, decibels / 20);
    }

    setBandQs(values: number[]): void {
        this.bandQs = this.eqBands.map((_, index) => Math.max(.3, Math.min(4, values[index] ?? this.config.q)));
        this.eqBandNodes.forEach((node, index) => node.Q.value = this.bandQs[index]);
    }

}
