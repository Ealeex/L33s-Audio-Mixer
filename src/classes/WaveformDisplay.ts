import Runtime from "../util/Runtime";

export class WaveformDisplay {

    canvas!: HTMLCanvasElement;
    ctx!: CanvasRenderingContext2D;

    constructor() {
        this.canvas = this.createCanvas();
        this.ctx = this.canvas.getContext('2d')!;
        this.setup();
    }

    createCanvas() {
        let canvas = document.createElement('canvas') as HTMLCanvasElement;
        canvas.width = 300;
        canvas.height = 100;
        document.getElementById('wrapper')!.appendChild(canvas);
        return canvas; 
    }

    setup() {
        let intervalId = setInterval(()=>{
            Runtime.storage.local.get('waveformData', (result) => {
                const waveform = result.waveformData as number[];
                if(waveform) this.draw(waveform);
            })
        },1000/144)
    }

    draw(waveform: number[]) {
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.beginPath();

        const binCount = waveform.length;

        for (let i = 0; i < binCount; i++) {
            const x = (i / (binCount - 1)) * this.canvas.width;
            // Normalize waveform from -1..1 to canvas height
            const y = ((1 - waveform[i]) / 2) * this.canvas.height;

            if (i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        }

        this.ctx.strokeStyle = 'lime';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }

}