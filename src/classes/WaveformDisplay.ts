import Runtime from "../util/Runtime";

export class WaveformDisplay {

    waveformCanvas!: HTMLCanvasElement;
    waveformCTX!: CanvasRenderingContext2D;

    constructor() {
        this.waveformCanvas = document.getElementById('waveform') as HTMLCanvasElement;
        this.waveformCTX = this.waveformCanvas.getContext('2d')!;
        this.setup();
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
        this.waveformCTX.fillStyle = 'black';
        this.waveformCTX.fillRect(0, 0, this.waveformCanvas.width, this.waveformCanvas.height);
        this.waveformCTX.beginPath();

        const binCount = waveform.length;

        for (let i = 0; i < binCount; i++) {
            const x = (i / (binCount - 1)) * this.waveformCanvas.width;
            // Normalize waveform from -1..1 to canvas height
            const y = ((1 - waveform[i]) / 2) * this.waveformCanvas.height;

            if (i === 0) this.waveformCTX.moveTo(x, y);
            else this.waveformCTX.lineTo(x, y);
        }

        this.waveformCTX.strokeStyle = 'lime';
        this.waveformCTX.lineWidth = 2;
        this.waveformCTX.stroke();
    }

}