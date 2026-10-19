import { AudioModule } from "./AudioModule";
import { EqualizerConfig } from "../util/EqualizerSettings";

export class Equalizer extends AudioModule {

    readonly name = 'Equalizer';

    // Config
    private eqBands: number[];
    // Nodes
    private eqBandNodes: BiquadFilterNode[] = [];
    private config: EqualizerConfig;

    constructor(bands: number[], config: EqualizerConfig) {
        super();
        this.eqBands = [...bands];
        this.config = { ...config };
    }

    protected async setup() {
        
        // Generate Nodes
        if (this.eqBands.length === 0) throw new Error('Equalizer has no bands');
        let previous: BiquadFilterNode | null = null;
        for (const freq of this.eqBands) {
            const node = this.createEQNode(freq, this.config.q);
            if (previous) previous.connect(node);
            previous = node;
        }
        this.applyFilterTypes();

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

    private applyFilterTypes(): void {
        this.eqBandNodes.forEach(node => node.type = "peaking");
        if (this.config.shelfEndpoints && this.eqBandNodes.length >= 2) {
            this.eqBandNodes[0].type = "lowshelf";
            this.eqBandNodes[this.eqBandNodes.length - 1].type = "highshelf";
        }
    }

    setConfig(config: EqualizerConfig): void {
        this.config = { ...config };
        this.eqBandNodes.forEach(node => node.Q.value = config.q);
        this.applyFilterTypes();
    }

    setBands(bands: number[], gains: number[] = []): void {
        if (bands.length === 0) return;
        this.entryNode.disconnect();
        this.eqBandNodes.forEach(node => node.disconnect());
        this.eqBandNodes = [];
        this.eqBands = [...bands];
        let previous: BiquadFilterNode | null = null;
        for (const frequency of bands) {
            const node = this.createEQNode(frequency, this.config.q);
            if (previous) previous.connect(node);
            previous = node;
        }
        this.applyFilterTypes();
        this.entryNode.connect(this.eqBandNodes[0]);
        this.eqBandNodes[this.eqBandNodes.length - 1].connect(this.exitNode);
        this.setBandGains(gains);
    }

    setBandGains(value: number[], transitionMs = 0) {
        for(const [index, node] of this.eqBandNodes.entries()) {
            const gain = Number.isFinite(value[index]) ? value[index] : 0;
            this.setParameterValue(node.gain, gain, transitionMs);
        }
    }

}
