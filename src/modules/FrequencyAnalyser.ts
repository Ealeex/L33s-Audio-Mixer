import { AudioModule } from "./AudioModule";

export class FrequencyAnalyser extends AudioModule {

    readonly name = 'Frequency_Analyser';

    // Config
    private readonly fftSize = 8192;
    private readonly visualBinCount = 256;
    static readonly visualMinimumFrequency = 30;
    static readonly visualMaximumFrequency = 12000;

    private data!: Float32Array<ArrayBuffer>;
    private visualData!: Float32Array<ArrayBuffer>;
    private visualBinStarts!: Uint16Array<ArrayBuffer>;
    private visualBinEnds!: Uint16Array<ArrayBuffer>;

    // Nodes
    analyserNode!: AnalyserNode;  

    protected createNodes() {
        this.analyserNode = this.audioContext.createAnalyser();
    }

    protected setupNodeRoutes() {
        this.entryNode.connect(this.analyserNode);
        this.analyserNode.connect(this.exitNode);
    }

    protected async setup() {
        this.analyserNode.fftSize = this.fftSize;
        this.analyserNode.minDecibels = -100;
        this.analyserNode.maxDecibels = 0;
        this.analyserNode.smoothingTimeConstant = 0.25;

        this.data = new Float32Array(this.analyserNode.frequencyBinCount);
        this.visualData = new Float32Array(this.visualBinCount);
        this.visualBinStarts = new Uint16Array(this.visualBinCount);
        this.visualBinEnds = new Uint16Array(this.visualBinCount);
        const nyquist = this.audioContext.sampleRate / 2;
        const hzPerBin = nyquist / this.data.length;
        const logMin = Math.log10(FrequencyAnalyser.visualMinimumFrequency);
        const logRange = Math.log10(FrequencyAnalyser.visualMaximumFrequency) - logMin;
        for (let index = 0; index < this.visualBinCount; index++) {
            const firstFrequency = 10 ** (logMin + index / this.visualBinCount * logRange);
            const lastFrequency = 10 ** (logMin + (index + 1) / this.visualBinCount * logRange);
            this.visualBinStarts[index] = Math.max(0, Math.floor(firstFrequency / hzPerBin));
            this.visualBinEnds[index] = Math.min(this.data.length - 1, Math.ceil(lastFrequency / hzPerBin));
        }
    }

    getVisualData(): number[] {
        this.analyserNode.getFloatFrequencyData(this.data);
        return Array.from(this.getLogFrequencyData());
    }

    private getLogFrequencyData(): Float32Array<ArrayBuffer> {
        for (let i = 0; i < this.visualBinCount; i++) {
            let max = -100;
            let sum = 0;
            let count = 0;
            for (let b = this.visualBinStarts[i]; b <= this.visualBinEnds[i]; b++) {
                const v = this.data[b];
                if (v > max) max = v;
                sum += v;
                count++;
            }

            const avg = count > 0 ? sum / count : -100;
            const value = max * 0.7 + avg * 0.3;
            this.visualData[i] = Number.isFinite(value) ? value : -100;
        }
        return this.visualData;
    }

}
