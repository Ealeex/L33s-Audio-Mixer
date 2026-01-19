import Runtime from "../util/Runtime";

export class FrequencyDisplay {

    freqCanvas!: HTMLCanvasElement;
    freqCTX!: CanvasRenderingContext2D;

    constructor() {
        this.freqCanvas = document.getElementById('frequency') as HTMLCanvasElement;
        this.freqCTX = this.freqCanvas.getContext('2d')!;
        this.setup();
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

        this.freqCTX.fillStyle = 'black';
        this.freqCTX.fillRect(0, 0, this.freqCanvas.width, this.freqCanvas.height);
        this.freqCTX.beginPath();

        const minDb = -100;
        const maxDb = 0;
        const binCount = frequencyData.length;

        for (let i = 0; i < binCount; i++) {
            const x = (i / (binCount - 1)) * this.freqCanvas.width;
            const yNorm = (frequencyData[i] - minDb) / (maxDb - minDb);
            const y = this.freqCanvas.height - yNorm * this.freqCanvas.height;
            if (i === 0) this.freqCTX.moveTo(x, y);
            else this.freqCTX.lineTo(x, y);
        }

        this.freqCTX.strokeStyle = 'white';
        this.freqCTX.lineWidth = 2;
        this.freqCTX.stroke();
    }

}