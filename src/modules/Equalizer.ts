import { AudioModule } from "./AudioModule";

export class Equalizer extends AudioModule {

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