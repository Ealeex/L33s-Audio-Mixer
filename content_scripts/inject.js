"use strict";
class Equalizer {
    constructor() {
        this.eqBands = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
        this.eqBandNodes = [];
    }
    async init(audioContext) {
        if (this.audioContext)
            return;
        this.audioContext = audioContext;
        let previousNode = null;
        this.eqBands.forEach(band => {
            let node = this.createEQNode(band);
            if (previousNode)
                previousNode.connect(node);
            previousNode = node;
        });
        this.eqBandNodes[0].type = 'lowshelf';
        this.eqBandNodes[this.eqBands.length - 1].type = 'highshelf';
    }
    createEQNode(frequency, Q = 1.4) {
        let band = this.audioContext.createBiquadFilter();
        band.frequency.value = frequency;
        band.type = 'peaking';
        band.Q.value = Q;
        this.eqBandNodes.push(band);
        return band;
    }
    setFrequencyGain(frequencyIndex, gain) {
        this.eqBandNodes[frequencyIndex].gain.value = gain;
    }
    get entry() {
        return this.eqBandNodes[0];
    }
    connect(node) {
        this.eqBandNodes[this.eqBandNodes.length - 1].connect(node);
    }
}
class Convolver {
    async init(audioContext) {
        if (this.audioContext)
            return;
        this.audioContext = audioContext;
        this.createNodeTree();
        this.setupNodeRoutes();
        await this.loadSample();
        this.dryGainNode.gain.value = 0.5;
        this.wetGainNode.gain.value = 0.5;
    }
    createNodeTree() {
        this.entryNode = this.audioContext.createGain();
        this.dryGainNode = this.audioContext.createGain();
        this.wetGainNode = this.audioContext.createGain();
        this.convolverNode = this.audioContext.createConvolver();
        this.exitNode = this.audioContext.createGain();
    }
    setupNodeRoutes() {
        this.entryNode.connect(this.dryGainNode);
        this.entryNode.connect(this.convolverNode);
        this.convolverNode.connect(this.wetGainNode);
        this.dryGainNode.connect(this.exitNode);
        this.wetGainNode.connect(this.exitNode);
    }
    async loadSample() {
        this.convolverNode.buffer = await this.loadAudioBuffer('./content_scripts/impulse.wav');
    }
    async loadAudioBuffer(path) {
        try {
            const url = browser.runtime.getURL(path);
            const res = await fetch(url);
            const arrayBuffer = await res.arrayBuffer();
            return await this.audioContext.decodeAudioData(arrayBuffer);
        }
        catch (err) {
            throw new Error('Failed to create buffer');
        }
    }
    get entry() {
        return this.entryNode;
    }
    connect(node) {
        this.exitNode.connect(node);
    }
    set mix(newMix) {
        this.dryGainNode.gain.value = 1 - newMix;
        this.wetGainNode.gain.value = newMix;
    }
}
class AudioHandler {
    constructor() {
        this.audioContext = new AudioContext();
        this.targets = new Set();
        this.entryNode = null;
        this.equalizer = new Equalizer();
        this.convolver = new Convolver();
    }
    async init() {
        await this.equalizer.init(this.audioContext);
        await this.convolver.init(this.audioContext);
        this.entryNode = this.audioContext.createGain();
        this.entryNode.connect(this.convolver.entry);
        this.convolver.connect(this.equalizer.entry);
        this.equalizer.connect(this.audioContext.destination);
        await this.handleUserSettings();
    }
    attach(mediaElement) {
        if (this.targets.has(mediaElement))
            return;
        this.targets.add(mediaElement);
        let sourceNode = this.audioContext.createMediaElementSource(mediaElement);
        sourceNode.connect(this.entryNode);
    }
    async handleUserSettings() {
        let storageQuery = ['convolver_mix', ...this.equalizer.eqBands.map(band => `band-${band}`)];
        let result = await browser.storage.local.get(storageQuery);
        Object.entries(result).forEach(entry => {
            let [key, value] = entry;
            if (key == 'convolver_mix')
                this.convolver.mix = typeof value === 'number' ? value : 0.5;
            if (key.startsWith('band-')) {
                let bandIndex = this.equalizer.eqBands.indexOf(parseInt(key.replace('band-', '')));
                this.equalizer.setFrequencyGain(bandIndex, value);
            }
        });
        browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log(`[LeeAudio] Message Received: `, { action: message.action, value: message.value });
            if (message.action === "set-convolver_mix")
                this.convolver.mix = message.value;
            if (message.action.startsWith('set-band-')) {
                let bandIndex = this.equalizer.eqBands.indexOf(parseInt(message.action.replace('set-band-', '')));
                this.equalizer.setFrequencyGain(bandIndex, message.value);
            }
        });
    }
}
(async () => {
    let audioHandler = new AudioHandler();
    await audioHandler.init();
    window.addEventListener("play", (e) => { if (e.target instanceof HTMLMediaElement)
        audioHandler.attach(e.target); }, true);
    const originalAudioPlay = Audio.prototype.play;
    Audio.prototype.play = function () {
        audioHandler.attach(this);
        return originalAudioPlay.apply(this, arguments);
    };
})();
