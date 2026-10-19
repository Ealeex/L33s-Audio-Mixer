import { AudioModule } from "./AudioModule";

export class FrequencyAnalyser extends AudioModule {

    readonly name = 'Frequency_Analyser';

    // Config
    private fftSize = 16384;
    private visualBinCount = 256;

    private data!: Float32Array<ArrayBuffer>;

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
    }

    getVisualData(): number[] {
        this.analyserNode.getFloatFrequencyData(this.data);
        return Array.from(this.getLogFrequencyData(this.visualBinCount));
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