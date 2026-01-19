import Runtime from "../util/Runtime";
import { StorageManager } from "../classes/StorageManager";
import { AudioModule } from "./AudioModule";

export class WaveformAnalyser extends AudioModule {

    readonly name = 'Waveform_Analyser';
    
    // Config
    private fftSize = 2048;

    // Storage
    private isVisible = true;
    private data!: Float32Array;

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
        StorageManager.set('waveformData', Array.from(this.data))
    }

}
