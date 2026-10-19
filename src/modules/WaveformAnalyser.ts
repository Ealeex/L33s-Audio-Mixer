import { AudioModule } from "./AudioModule";

export class WaveformAnalyser extends AudioModule {

    readonly name = 'Waveform_Analyser';
    
    // Config
    private fftSize = 2048;

    private data!: Float32Array<ArrayBuffer>;

    // Nodes
    private analyserNode!: AnalyserNode;

    protected createNodes() {
        this.analyserNode = this.audioContext.createAnalyser();
    }

    protected setupNodeRoutes() {
        this.entryNode.connect(this.analyserNode);
        this.analyserNode.connect(this.exitNode);
    }

    protected async setup() {
        this.analyserNode.fftSize = this.fftSize;
        this.analyserNode.smoothingTimeConstant = 1; // built-in smoothing

        this.data = new Float32Array(this.analyserNode.fftSize);
    }

    getVisualData(): number[] {
        this.analyserNode.getFloatTimeDomainData(this.data);
        return Array.from(this.data);
    }

}
