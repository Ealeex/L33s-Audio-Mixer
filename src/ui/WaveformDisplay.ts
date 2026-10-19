export class WaveformDisplay {

    canvas!: HTMLCanvasElement;
    ctx!: CanvasRenderingContext2D;
    private readonly accent = '#e5777c';

    constructor() {
        this.canvas = this.createCanvas();
        this.ctx = this.canvas.getContext('2d')!;
    }

    createCanvas() {
        let canvas = document.createElement('canvas') as HTMLCanvasElement;
        canvas.width = 300;
        canvas.height = 100;
        canvas.classList.add('waveform-canvas');
        document.getElementById('visualizers')!.appendChild(canvas);
        return canvas; 
    }

    draw(waveform: number[]) {
        if (waveform.length === 0) return;
        this.clear();
        this.ctx.beginPath();

        let dataMin = Infinity;
        let dataMax = -Infinity;
        for (const value of waveform) {
            if (!Number.isFinite(value)) continue;
            dataMin = Math.min(dataMin, value);
            dataMax = Math.max(dataMax, value);
        }
        if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) return;
        const dataRange = Math.max(dataMax - dataMin, 0.02);
        const padding = dataRange * 0.1;
        const minValue = dataMin - padding;
        const maxValue = dataMax + padding;
        const plotHeight = this.canvas.height;
        const binCount = waveform.length;
        let hasStartedPath = false;

        for (let i = 0; i < binCount; i++) {
            const x = (i / (binCount - 1)) * this.canvas.width;
            if (!Number.isFinite(waveform[i])) continue;
            const yNorm = (waveform[i] - minValue) / (maxValue - minValue);
            const y = plotHeight - yNorm * plotHeight;

            if (!hasStartedPath) {
                this.ctx.moveTo(x, y);
                hasStartedPath = true;
            }
            else this.ctx.lineTo(x, y);
        }

        this.ctx.strokeStyle = this.accent;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }

    clear(): void {
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

}
