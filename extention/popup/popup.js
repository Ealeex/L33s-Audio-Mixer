"use strict";
const _runtime = typeof browser !== "undefined" ? browser : chrome;
const log = (...args) => console.log(`[LeeAudio] (Web) `, ...args);
class UserRangeOption {
    name;
    storageName;
    containerElem;
    inputElem;
    labelElem;
    min;
    max;
    step;
    default;
    constructor(opts) {
        this.name = opts.name;
        this.storageName = this.name.toLowerCase().split(' ').join('_');
        this.min = opts.min ?? 0;
        this.max = opts.max ?? 1;
        this.step = opts.step ?? 0.01;
        this.default = opts.default ?? 0.5;
        this.createElement();
        this.setupStorage();
    }
    async setupStorage() {
        // Load any settings
        let result = await _runtime.storage.local.get(this.storageName);
        this.inputElem.value = (typeof result[this.storageName] === 'number' ? result[this.storageName] : this.default).toString();
        // Add Listener
        this.inputElem.addEventListener('input', () => {
            const value = parseFloat(this.inputElem.value);
            _runtime.storage.local.set({ [this.storageName]: value });
            _runtime.tabs.query({}).then((tabs) => {
                for (const tab of tabs)
                    if (tab.id !== undefined)
                        _runtime.tabs.sendMessage(tab.id, { action: `set-${this.storageName}`, value });
            });
        });
    }
    createElement() {
        this.containerElem = document.createElement('div');
        this.containerElem.classList.add('option-container');
        this.labelElem = document.createElement('label');
        this.labelElem.innerText = this.name;
        this.labelElem.classList.add('option-label');
        this.containerElem.appendChild(this.labelElem);
        this.inputElem = document.createElement('input');
        this.inputElem.type = 'range';
        this.inputElem.min = this.min.toString();
        this.inputElem.max = this.max.toString();
        this.inputElem.step = this.step.toString();
        this.inputElem.value = this.default.toString();
        this.inputElem.classList.add('option-range');
        this.containerElem.appendChild(this.inputElem);
        document.body.appendChild(this.containerElem);
    }
}
class WebEqualizer {
    bands = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000];
    min;
    max;
    step;
    default;
    constructor(opts) {
        this.min = opts?.min ?? -20;
        this.max = opts?.max ?? 20;
        this.step = opts?.step ?? 1;
        this.default = opts?.default ?? 0;
        this.createElement();
    }
    async createBandRange(frequency) {
        // Range Container
        let rangeContainer = document.createElement('div');
        rangeContainer.classList.add('equalizer-range-container');
        // Range Input
        let range = document.createElement('input');
        range.type = 'range';
        range.min = this.min.toString();
        range.max = this.max.toString();
        range.step = this.step.toString();
        range.value = this.default.toString();
        range.classList.add('equalizer-range');
        rangeContainer.appendChild(range);
        let storageName = `band-${frequency}`;
        // Load any settings
        let result = await _runtime.storage.local.get(storageName);
        range.value = (typeof result[storageName] === 'number' ? result[storageName] : this.default).toString();
        // Add Listener
        range.addEventListener('input', () => {
            const value = parseFloat(range.value);
            _runtime.storage.local.set({ [storageName]: value });
            _runtime.tabs.query({}).then((tabs) => {
                for (const tab of tabs)
                    if (tab.id !== undefined)
                        _runtime.tabs.sendMessage(tab.id, { action: `set-${storageName}`, value });
            });
        });
        // Label
        let label = document.createElement('label');
        label.innerText = frequency.toString().replace('000', 'k');
        rangeContainer.appendChild(label);
        return rangeContainer;
    }
    createElement() {
        let container = document.createElement('div');
        container.classList.add('equalizer-container');
        this.bands.forEach(async (band) => { container.appendChild(await this.createBandRange(band)); });
        document.body.appendChild(container);
    }
}
const waveformCanvas = document.getElementById('waveform');
const waveformCTX = waveformCanvas.getContext('2d');
const freqCanvas = document.getElementById('frequency');
const freqCTX = freqCanvas.getContext('2d');
function setupGraph_FrequencyDomain() {
    let intervalId = setInterval(() => {
        _runtime.storage.local.get('analyserData', (result) => {
            const frequencies = result.analyserData;
            if (frequencies)
                drawEQ(frequencies);
        });
    }, 1000 / 144);
}
function drawEQ(frequencyData) {
    freqCTX.fillStyle = 'black';
    freqCTX.fillRect(0, 0, freqCanvas.width, freqCanvas.height);
    freqCTX.beginPath();
    const minDb = -100;
    const maxDb = 0;
    const binCount = frequencyData.length;
    for (let i = 0; i < binCount; i++) {
        const x = (i / (binCount - 1)) * freqCanvas.width;
        const yNorm = (frequencyData[i] - minDb) / (maxDb - minDb);
        const y = freqCanvas.height - yNorm * freqCanvas.height;
        if (i === 0)
            freqCTX.moveTo(x, y);
        else
            freqCTX.lineTo(x, y);
    }
    freqCTX.strokeStyle = 'white';
    freqCTX.lineWidth = 2;
    freqCTX.stroke();
}
function setupGraph_TimeDomain() {
    let intervalId = setInterval(() => {
        _runtime.storage.local.get('waveformData', (result) => {
            const waveform = result.waveformData;
            if (waveform)
                drawWaveform(waveform);
        });
    }, 1000 / 144);
}
function drawWaveform(waveform) {
    waveformCTX.fillStyle = 'black';
    waveformCTX.fillRect(0, 0, waveformCanvas.width, waveformCanvas.height);
    waveformCTX.beginPath();
    const binCount = waveform.length;
    for (let i = 0; i < binCount; i++) {
        const x = (i / (binCount - 1)) * waveformCanvas.width;
        // Normalize waveform from -1..1 to canvas height
        const y = ((1 - waveform[i]) / 2) * waveformCanvas.height;
        if (i === 0)
            waveformCTX.moveTo(x, y);
        else
            waveformCTX.lineTo(x, y);
    }
    waveformCTX.strokeStyle = 'lime';
    waveformCTX.lineWidth = 2;
    waveformCTX.stroke();
}
document.addEventListener('DOMContentLoaded', async () => {
    new UserRangeOption({ name: 'Pre-amp', min: 0, max: 1, step: 0.01 });
    new UserRangeOption({ name: 'Convolver Mix', step: 0.1 });
    new UserRangeOption({ name: 'Stereo Seperation', min: 0, default: 1, max: 5, step: 1 });
    new WebEqualizer({ min: -20, max: 20, step: 2 });
    setupGraph_FrequencyDomain();
    setupGraph_TimeDomain();
});
