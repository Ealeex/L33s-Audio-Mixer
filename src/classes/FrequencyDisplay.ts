import Runtime from "../util/Runtime";

export class FrequencyDisplay {

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
            Runtime.storage.local.get('analyserData', (result) => {
                const frequencies = result.analyserData as number[];
                if (frequencies) this.draw(frequencies);
            })
        },1000/144)
    }

    draw(frequencyData: number[]) {

        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.beginPath();

        const minDb = -100;
        const maxDb = 0;
        const binCount = frequencyData.length;

        for (let i = 0; i < binCount; i++) {
            const x = (i / (binCount - 1)) * this.canvas.width;
            const yNorm = (frequencyData[i] - minDb) / (maxDb - minDb);
            const y = this.canvas.height - yNorm * this.canvas.height;
            if (i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        }

        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }

}