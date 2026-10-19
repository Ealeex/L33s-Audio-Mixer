export class FrequencyDisplay {

    canvas!: HTMLCanvasElement;
    ctx!: CanvasRenderingContext2D;

    constructor() {
        this.canvas = this.createCanvas();
        this.ctx = this.canvas.getContext('2d')!;
    }
    
    createCanvas() {
        let canvas = document.createElement('canvas') as HTMLCanvasElement;
        canvas.width = 300;
        canvas.height = 100;
        canvas.classList.add('frequency-canvas');
        document.getElementById('visualizers')!.appendChild(canvas);
        return canvas; 
    }

    draw(frequencyData: number[]) {
        if (frequencyData.length === 0) return;

        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.beginPath();

        const finiteData = frequencyData.filter(Number.isFinite);
        if (finiteData.length === 0) return;
        const dataMin = Math.min(...finiteData);
        const dataMax = Math.max(...finiteData);
        const dataRange = Math.max(dataMax - dataMin, 12);
        const padding = dataRange * 0.12;
        const minDb = dataMin - padding;
        const maxDb = dataMax + padding;
        const plotHeight = this.canvas.height;
        const binCount = frequencyData.length;
        let hasStartedPath = false;

        for (let i = 0; i < binCount; i++) {
            const x = (i / (binCount - 1)) * this.canvas.width;
            if (!Number.isFinite(frequencyData[i])) continue;
            const yNorm = (frequencyData[i] - minDb) / (maxDb - minDb);
            const y = plotHeight - yNorm * plotHeight;
            if (!hasStartedPath) {
                this.ctx.moveTo(x, y);
                hasStartedPath = true;
            }
            else this.ctx.lineTo(x, y);
        }

        this.ctx.strokeStyle = getComputedStyle(this.canvas).getPropertyValue('--accent').trim() || '#e5777c';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }

}