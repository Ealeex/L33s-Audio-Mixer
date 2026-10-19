import { Config } from "../Config";
import { Logger } from "../util/Logger";
import Runtime from "../util/Runtime";
import { createLogSpacedBands, getEqualizerConfig, remapEqualizerGains } from "../util/EqualizerSettings";

const graphMinimumFrequency = 20;
const graphMaximumFrequency = 20000;
const spectrumMinimumFrequency = 30;
const spectrumMaximumFrequency = 12000;
const newBandDefaultQ = 0.4;
const bandColors = ["#bd6268", "#cf6b70", "#df7474", "#e28782", "#c95d65", "#b95865", "#d6787d", "#a94f5a"];

export class WebEqualizer {
    private bands: number[];
    private values: number[];
    private min: number;
    private max: number;
    private step: number;
    private default: number;
    private qs: number[];
    private shelfEndpoints: boolean;
    private enabled = true;
    private offset = 0;
    private storageName = "equalizer";
    private container!: HTMLDivElement;
    private graph!: HTMLDivElement;
    private plotRow!: HTMLDivElement;
    private canvas!: HTMLCanvasElement;
    private context!: CanvasRenderingContext2D;
    private nodes: HTMLButtonElement[] = [];
    private hoveredBand: number | null = null;
    private tooltip!: HTMLDivElement;
    private spectrum: number[] = [];
    private resultingSpectrum: number[] = [];
    private spectrumEnabled = true;
    private spectrumMinimumFrequency = spectrumMinimumFrequency;
    private spectrumMaximumFrequency = spectrumMaximumFrequency;
    private responseSampleRate = 48000;
    private queuedSend: number | null = null;
    private sendPending = false;
    private sending = false;
    private pendingManualChange = false;
    private responseCache: number[] = [];
    private responseCacheWidth = 0;
    private responseDirty = true;
    private bandCountWheelDelta = 0;
    private bandCountWheelReset: number | null = null;
    private mount: HTMLElement;

    constructor(opts?: { bands?: number[]; min?: number; max?: number; step?: number; default?: number; q?: number; qs?: number[]; shelfEndpoints?: boolean; mount?: HTMLElement }) {
        this.bands = [...(opts?.bands ?? [])];
        this.min = opts?.min ?? -20;
        this.max = opts?.max ?? 20;
        this.step = opts?.step ?? 1;
        this.default = opts?.default ?? 0;
        this.qs = this.bands.map((_, index) => opts?.qs?.[index] ?? opts?.q ?? 1);
        this.shelfEndpoints = opts?.shelfEndpoints !== false;
        this.mount = opts?.mount ?? document.getElementById("wrapper")!;
        this.values = this.bands.map(() => this.default);
    }

    async init() {
        this.createElement();
        await this.setupStorage();
        this.updateLayout();
        return this;
    }

    private async setupStorage() {
        const result = await Runtime.storage.local.get(this.storageName);
        const stored = Array.isArray(result[this.storageName]) ? result[this.storageName] : this.values;
        this.setValue(stored, false);
    }

    private createElement() {
        this.container = document.createElement("div");
        this.container.className = "equalizer-container parametric-equalizer";
        this.graph = document.createElement("div");
        this.graph.className = "equalizer-graph";
        this.graph.addEventListener("wheel", event => this.handleBandCountWheel(event), { passive: false });
        this.plotRow = document.createElement("div");
        this.plotRow.className = "equalizer-plot-row";
        this.canvas = document.createElement("canvas");
        this.canvas.className = "equalizer-curve";
        this.context = this.canvas.getContext("2d")!;
        this.tooltip = document.createElement("div");
        this.tooltip.className = "equalizer-node-tooltip";
        this.tooltip.setAttribute("role", "status");
        this.graph.append(this.canvas, this.tooltip);
        this.plotRow.appendChild(this.graph);

        this.rebuildNodes();

        this.container.append(this.plotRow);
        this.mount.appendChild(this.container);
        new ResizeObserver(() => this.updateLayout()).observe(this.graph);
    }

    private rebuildNodes(): void {
        this.nodes.forEach(node => node.remove());
        this.nodes = [];
        this.bands.forEach((_, index) => {
            const node = document.createElement("button");
            node.type = "button";
            node.className = "equalizer-node";
            node.style.setProperty("--band-color", bandColors[index % bandColors.length]);
            node.textContent = String(index + 1);
            node.setAttribute("aria-label", `Equalizer band ${index + 1}`);
            node.addEventListener("pointerdown", event => this.startDrag(index, event));
            node.addEventListener("keydown", event => this.handleKeyboard(index, event));
            node.addEventListener("wheel", event => this.handleQWheel(index, event), { passive: false });
            node.addEventListener("pointerenter", () => this.setHoveredBand(index));
            node.addEventListener("pointerleave", () => this.setHoveredBand(null));
            node.addEventListener("focus", () => this.setHoveredBand(index));
            node.addEventListener("blur", () => this.setHoveredBand(null));
            this.nodes.push(node);
            this.graph.appendChild(node);
        });
    }

    private changeBandCount(requestedCount: number): void {
        const count = Math.max(Config.MIN_EQ_BANDS, Math.min(Config.MAX_EQ_BANDS, requestedCount));
        if (count === this.bands.length) return;
        const previousBands = [...this.bands];
        const previousValues = [...this.values];
        const previousQs = [...this.qs];
        this.bands = createLogSpacedBands(count, previousBands[0], previousBands[previousBands.length - 1]);
        this.values = remapEqualizerGains(previousBands, previousValues, this.bands)
            .map(gain => Math.max(this.min, Math.min(this.max, gain)));
        this.qs = remapEqualizerGains(previousBands, previousQs, this.bands)
            .map(q => Math.max(.3, Math.min(4, q)));
        if (count > previousBands.length) {
            const addedBandCount = count - previousBands.length;
            const leastMatchedBands = this.bands
                .map((band, index) => ({
                    index,
                    distance: Math.min(...previousBands.map(previousBand => Math.abs(Math.log(band / previousBand))))
                }))
                .sort((left, right) => right.distance - left.distance)
                .slice(0, addedBandCount);
            leastMatchedBands.forEach(({ index }) => { this.qs[index] = newBandDefaultQ; });
        }
        this.rebuildNodes();
        this.updateLayout();
        void this.sendQs();
        void this.sendData(true);
    }

    private setHoveredBand(index: number | null): void {
        this.hoveredBand = index;
        this.updateTooltip();
        this.draw();
    }

    private handleQWheel(index: number, event: WheelEvent): void {
        event.preventDefault();
        event.stopPropagation();
        const direction = event.deltaY < 0 ? 1 : -1;
        this.qs[index] = Math.round(Math.max(.3, Math.min(4, this.qs[index] + direction * .1)) * 10) / 10;
        this.responseDirty = true;
        this.updateLayout();
        void this.sendQs();
    }

    private handleBandCountWheel(event: WheelEvent): void {
        event.preventDefault();
        this.bandCountWheelDelta += event.deltaY;
        if (this.bandCountWheelReset !== null) window.clearTimeout(this.bandCountWheelReset);
        this.bandCountWheelReset = window.setTimeout(() => {
            this.bandCountWheelDelta = 0;
            this.bandCountWheelReset = null;
        }, 180);
        if (Math.abs(this.bandCountWheelDelta) < 40) return;
        const direction = this.bandCountWheelDelta < 0 ? 1 : -1;
        this.bandCountWheelDelta = 0;
        this.changeBandCount(this.bands.length + direction);
    }

    private async sendQs(): Promise<void> {
        await Runtime.storage.local.set({ "equalizer-qs": [...this.qs] });
        const tabs = await Runtime.tabs.query({});
        for (const tab of tabs) if (tab.id != null) try {
            await Runtime.tabs.sendMessage(tab.id, { action: "set-equalizer-qs", value: [...this.qs] });
        } catch {}
    }

    private startDrag(index: number, event: PointerEvent): void {
        event.preventDefault();
        const node = this.nodes[index];
        node.setPointerCapture(event.pointerId);
        const update = (pointerEvent: PointerEvent) => {
            const bounds = this.graph.getBoundingClientRect();
            const x = Math.max(0, Math.min(bounds.width, pointerEvent.clientX - bounds.left));
            const y = Math.max(0, Math.min(bounds.height, pointerEvent.clientY - bounds.top));
            this.bands[index] = Math.round(Math.max(graphMinimumFrequency, Math.min(graphMaximumFrequency, this.xToFrequency(x, bounds.width))));
            const rawGain = this.max - (y / bounds.height) * (this.max - this.min);
            this.values[index] = Math.max(this.min, Math.min(this.max, rawGain));
            this.updateLayout();
            this.queueData();
        };
        const finish = () => {
            node.removeEventListener("pointermove", update);
            void this.sendData(true);
        };
        node.addEventListener("pointermove", update);
        node.addEventListener("pointerup", finish, { once: true });
        node.addEventListener("pointercancel", finish, { once: true });
    }

    private handleKeyboard(index: number, event: KeyboardEvent): void {
        const frequencyKeys = event.key === "ArrowLeft" || event.key === "ArrowRight";
        const gainKeys = event.key === "ArrowUp" || event.key === "ArrowDown";
        if (!frequencyKeys && !gainKeys) return;
        event.preventDefault();
        if (gainKeys) {
            const direction = event.key === "ArrowUp" ? 1 : -1;
            this.values[index] = Math.max(this.min, Math.min(this.max, this.values[index] + direction * this.step));
        } else {
            const direction = event.key === "ArrowRight" ? 1 : -1;
            const multiplier = Math.pow(2, direction / 12);
            this.bands[index] = Math.round(Math.max(graphMinimumFrequency, Math.min(graphMaximumFrequency, this.bands[index] * multiplier)));
        }
        this.updateLayout();
        void this.sendData(true);
    }

    private queueData(): void {
        if (this.queuedSend !== null) return;
        this.queuedSend = requestAnimationFrame(() => {
            this.queuedSend = null;
            void this.sendData(false);
        });
    }

    private async sendData(manual: boolean) {
        this.sendPending = true;
        this.pendingManualChange ||= manual;
        if (this.sending) return;
        this.sending = true;
        while (this.sendPending) {
            this.sendPending = false;
            const values = [...this.values];
            const bands = [...this.bands];
            const markManual = this.pendingManualChange;
            this.pendingManualChange = false;
            await Runtime.storage.local.set({ [this.storageName]: values, "equalizer-bands": bands });
            const tabs = await Runtime.tabs.query({});
            for (const tab of tabs) if (tab.id != null) try {
                await Runtime.tabs.sendMessage(tab.id, { action: "set-equalizer-bands", value: bands });
                await Runtime.tabs.sendMessage(tab.id, { action: `set-${this.storageName}`, value: values });
            } catch (error) {
                Logger.logErr(`Unable to update equalizer in tab ${tab.id}:`, error);
            }
            if (markManual) document.dispatchEvent(new CustomEvent("preset:manual-change"));
        }
        this.sending = false;
    }

    private frequencyToX(frequency: number, width: number): number {
        return Math.log(frequency / graphMinimumFrequency) / Math.log(graphMaximumFrequency / graphMinimumFrequency) * width;
    }

    private xToFrequency(x: number, width: number): number {
        return graphMinimumFrequency * Math.pow(graphMaximumFrequency / graphMinimumFrequency, x / width);
    }

    private gainToY(gain: number, height: number): number {
        return (this.max - gain) / (this.max - this.min) * height;
    }

    private updateLayout(): void {
        const width = this.graph.clientWidth;
        const height = this.graph.clientHeight;
        if (!width || !height) return;
        this.responseDirty = true;
        this.nodes.forEach((node, index) => {
            node.style.left = `${Math.max(11, Math.min(width - 11, this.frequencyToX(this.bands[index], width)))}px`;
            node.style.top = `${Math.max(11, Math.min(height - 11, this.gainToY(this.values[index], height)))}px`;
            node.setAttribute("aria-valuetext", `${this.formatFrequency(this.bands[index])}, ${this.formatGain(this.values[index])}, Q ${this.qs[index].toFixed(1)}`);
        });
        this.updateTooltip();
        this.draw();
    }

    private updateTooltip(): void {
        if (this.hoveredBand === null || !this.nodes[this.hoveredBand]) {
            this.tooltip.classList.remove("is-visible", "is-below");
            return;
        }
        const index = this.hoveredBand;
        const nodeX = Number.parseFloat(this.nodes[index].style.left);
        const nodeY = Number.parseFloat(this.nodes[index].style.top);
        const showBelow = nodeY < 42;
        this.tooltip.textContent = `BAND ${index + 1}  ·  ${this.formatFrequency(this.bands[index])} Hz  ·  ${this.formatGain(this.values[index])}  ·  Q ${this.qs[index].toFixed(1)}`;
        this.tooltip.style.left = `${Math.max(75, Math.min(this.graph.clientWidth - 75, nodeX))}px`;
        this.tooltip.style.top = `${nodeY + (showBelow ? 16 : -16)}px`;
        this.tooltip.classList.toggle("is-below", showBelow);
        this.tooltip.classList.add("is-visible");
    }

    private draw(): void {
        const width = this.graph.clientWidth;
        const height = this.graph.clientHeight;
        const scale = window.devicePixelRatio || 1;
        if (this.canvas.width !== Math.round(width * scale) || this.canvas.height !== Math.round(height * scale)) {
            this.canvas.width = Math.round(width * scale);
            this.canvas.height = Math.round(height * scale);
        }
        const ctx = this.context;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.clearRect(0, 0, width, height);
        this.drawGrid(ctx, width, height);
        if (this.spectrumEnabled) {
            this.drawSpectrum(ctx, width, height, this.spectrum, false);
            this.drawSpectrum(ctx, width, height, this.resultingSpectrum, true);
        }
        this.drawResponse(ctx, width, height);
    }

    private drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        ctx.lineWidth = 1;
        for (const frequency of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) {
            const x = this.frequencyToX(frequency, width);
            ctx.strokeStyle = "rgba(130, 151, 158, .11)";
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (const gain of [-this.max, -this.max / 2, 0, this.max / 2, this.max]) {
            const y = this.gainToY(gain, height);
            ctx.strokeStyle = gain === 0 ? "rgba(230, 235, 236, .42)" : "rgba(130, 151, 158, .1)";
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
    }

    private drawSpectrum(ctx: CanvasRenderingContext2D, width: number, height: number, spectrum: number[], resulting: boolean): void {
        if (spectrum.length < 2) return;
        ctx.beginPath();
        spectrum.forEach((decibels, index) => {
            const position = index / (spectrum.length - 1);
            const frequency = this.spectrumMinimumFrequency
                * Math.pow(this.spectrumMaximumFrequency / this.spectrumMinimumFrequency, position);
            const x = this.frequencyToX(frequency, width);
            const normalized = Math.max(0, Math.min(1, (decibels + 100) / 100));
            const y = height - normalized * height * .82;
            if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, resulting ? "rgba(223, 116, 116, .15)" : "rgba(184, 205, 210, .18)");
        gradient.addColorStop(1, resulting ? "rgba(223, 116, 116, .015)" : "rgba(184, 205, 210, .02)");
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = resulting ? "rgba(223, 116, 116, .5)" : "rgba(205, 220, 223, .34)";
        ctx.lineWidth = resulting ? 1.25 : 1;
        ctx.stroke();
    }

    private drawResponse(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        const sampleCount = 180;
        const responseAt = (frequency: number) => this.bands.reduce((total, band, index) => {
            const type = this.shelfEndpoints && index === 0
                ? "lowshelf"
                : this.shelfEndpoints && index === this.bands.length - 1
                    ? "highshelf"
                    : "peaking";
            return total + this.getFilterResponse(type, band, this.enabled ? this.values[index] : 0, frequency);
        }, 0);
        if (this.responseDirty || this.responseCacheWidth !== width) {
            this.responseCache = Array.from({ length: sampleCount }, (_, index) => {
                const x = index / (sampleCount - 1) * width;
                const frequency = this.xToFrequency(x, width);
                return Math.max(this.min, Math.min(this.max, responseAt(frequency)));
            });
            this.responseCacheWidth = width;
            this.responseDirty = false;
        }
        ctx.beginPath();
        for (let index = 0; index < this.responseCache.length; index++) {
            const x = index / (this.responseCache.length - 1) * width;
            const displayedGain = this.responseCache[index] + (this.enabled ? this.offset : 0);
            const y = this.gainToY(Math.max(this.min, Math.min(this.max, displayedGain)), height);
            if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(236, 241, 241, .92)";
        ctx.lineWidth = 2;
        ctx.shadowColor = "rgba(236, 241, 241, .18)";
        ctx.shadowBlur = 5;
        ctx.stroke();
        ctx.shadowBlur = 0;

        if (this.hoveredBand === null) return;
        const bandIndex = this.hoveredBand;
        const type = this.shelfEndpoints && bandIndex === 0
            ? "lowshelf"
            : this.shelfEndpoints && bandIndex === this.bands.length - 1
                ? "highshelf"
                : "peaking";
        ctx.beginPath();
        for (let index = 0; index < sampleCount; index++) {
            const x = index / (sampleCount - 1) * width;
            const frequency = this.xToFrequency(x, width);
            const contribution = this.enabled
                ? this.getFilterResponse(type, this.bands[bandIndex], this.values[bandIndex], frequency)
                : 0;
            const y = this.gainToY(Math.max(this.min, Math.min(this.max, contribution)), height);
            if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(223, 116, 116, .58)";
        ctx.lineWidth = 1.5;
        ctx.shadowColor = "rgba(223, 116, 116, .3)";
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    private getFilterResponse(type: "lowshelf" | "highshelf" | "peaking", center: number, gain: number, frequency: number): number {
        if (gain === 0) return 0;
        const a = Math.pow(10, gain / 40);
        const omega = 2 * Math.PI * Math.min(frequency, this.responseSampleRate / 2) / this.responseSampleRate;
        const centerOmega = 2 * Math.PI * Math.min(center, this.responseSampleRate / 2) / this.responseSampleRate;
        const cosine = Math.cos(centerOmega);
        const sine = Math.sin(centerOmega);
        let b0: number;
        let b1: number;
        let b2: number;
        let a0: number;
        let a1: number;
        let a2: number;

        if (type === "peaking") {
            const bandIndex = this.bands.indexOf(center);
            const alpha = sine / (2 * (this.qs[bandIndex] ?? 1));
            b0 = 1 + alpha * a;
            b1 = -2 * cosine;
            b2 = 1 - alpha * a;
            a0 = 1 + alpha / a;
            a1 = -2 * cosine;
            a2 = 1 - alpha / a;
        } else {
            const alpha = sine / Math.SQRT2;
            const beta = 2 * Math.sqrt(a) * alpha;
            if (type === "lowshelf") {
                b0 = a * ((a + 1) - (a - 1) * cosine + beta);
                b1 = 2 * a * ((a - 1) - (a + 1) * cosine);
                b2 = a * ((a + 1) - (a - 1) * cosine - beta);
                a0 = (a + 1) + (a - 1) * cosine + beta;
                a1 = -2 * ((a - 1) + (a + 1) * cosine);
                a2 = (a + 1) + (a - 1) * cosine - beta;
            } else {
                b0 = a * ((a + 1) + (a - 1) * cosine + beta);
                b1 = -2 * a * ((a - 1) + (a + 1) * cosine);
                b2 = a * ((a + 1) + (a - 1) * cosine - beta);
                a0 = (a + 1) - (a - 1) * cosine + beta;
                a1 = 2 * ((a - 1) - (a + 1) * cosine);
                a2 = (a + 1) - (a - 1) * cosine - beta;
            }
        }

        const numeratorReal = b0 + b1 * Math.cos(omega) + b2 * Math.cos(2 * omega);
        const numeratorImaginary = -(b1 * Math.sin(omega) + b2 * Math.sin(2 * omega));
        const denominatorReal = a0 + a1 * Math.cos(omega) + a2 * Math.cos(2 * omega);
        const denominatorImaginary = -(a1 * Math.sin(omega) + a2 * Math.sin(2 * omega));
        const numeratorMagnitude = numeratorReal * numeratorReal + numeratorImaginary * numeratorImaginary;
        const denominatorMagnitude = denominatorReal * denominatorReal + denominatorImaginary * denominatorImaginary;
        return 10 * Math.log10(Math.max(Number.EPSILON, numeratorMagnitude / denominatorMagnitude));
    }

    private formatFrequency(frequency: number): string {
        return frequency >= 1000 ? `${(frequency / 1000).toFixed(frequency % 1000 === 0 ? 0 : 1)}k` : `${frequency}`;
    }

    private formatGain(gain: number): string {
        return `${gain > 0 ? "+" : ""}${gain.toFixed(1)} dB`;
    }

    setSpectrumData(spectrum: number[], resultingSpectrum: number[] = [], metadata?: { minimumFrequency: number; maximumFrequency: number; sampleRate: number }): void {
        this.spectrum = spectrum;
        this.resultingSpectrum = resultingSpectrum;
        if (metadata) {
            this.spectrumMinimumFrequency = metadata.minimumFrequency;
            this.spectrumMaximumFrequency = metadata.maximumFrequency;
            if (this.responseSampleRate !== metadata.sampleRate) {
                this.responseSampleRate = metadata.sampleRate;
                this.responseDirty = true;
            }
        }
        this.draw();
    }

    setSpectrumEnabled(enabled: boolean): void {
        this.spectrumEnabled = enabled;
        this.draw();
    }

    setValue(values: number[], manual = false) {
        this.values = this.bands.map((_, index) => Math.max(Math.min(values[index] ?? this.default, this.max), this.min));
        this.updateLayout();
        if (manual) void this.sendData(true);
    }

    animateToValue(values: number[], durationMs = Config.PRESET_TRANSITION_MS): void {
        void durationMs;
        this.values = this.bands.map((_, index) => Math.max(Math.min(values[index] ?? 0, this.max), this.min));
        this.updateLayout();
    }

    animateToPresetLayout(bands: number[], values: number[], qs = this.qs, shelfEndpoints = this.shelfEndpoints, durationMs = Config.PRESET_TRANSITION_MS): void {
        const previousBands = [...this.bands];
        const previousValues = [...this.values];
        this.qs = bands.map((_, index) => qs[index] ?? 1);
        this.shelfEndpoints = shelfEndpoints;
        this.bands = [...bands];
        this.values = remapEqualizerGains(previousBands, previousValues, this.bands)
            .map(gain => Math.max(this.min, Math.min(this.max, gain)));
        this.rebuildNodes();
        this.updateLayout();
        this.animateToValue(values, durationMs);
    }

    applyQuickPreset(bands: number[], values: number[], qs: number[], shelfEndpoints: boolean, durationMs = Config.PRESET_TRANSITION_MS): void {
        const targets = values.map(gain => Math.max(this.min, Math.min(this.max, gain)));
        this.animateToPresetLayout(bands, targets, qs, shelfEndpoints, durationMs);
        void getEqualizerConfig().then(async config => {
            const nextConfig = { ...config, shelfEndpoints };
            await Runtime.storage.local.set({ "equalizer-bands": [...bands], "equalizer-qs": [...qs], "equalizer-config": nextConfig, equalizer: targets, "equalizer-enabled": true });
            const tabs = await Runtime.tabs.query({});
            for (const tab of tabs) if (tab.id != null) try {
                await Runtime.tabs.sendMessage(tab.id, { action: "set-equalizer-bands", value: [...bands] });
                await Runtime.tabs.sendMessage(tab.id, { action: "set-equalizer-qs", value: [...qs] });
                await Runtime.tabs.sendMessage(tab.id, { action: "set-equalizer-config", value: nextConfig });
                await Runtime.tabs.sendMessage(tab.id, { action: "set-equalizer", value: targets, transitionMs: durationMs });
                await Runtime.tabs.sendMessage(tab.id, { action: "set-equalizer-enabled", value: true, transitionMs: durationMs });
            } catch {}
        });
        document.dispatchEvent(new CustomEvent("preset:manual-change"));
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        this.container.classList.toggle("is-bypassed", !enabled);
        this.responseDirty = true;
        this.draw();
    }

    setOffset(offset: number): void {
        this.offset = Math.max(this.min, Math.min(this.max, offset));
        this.draw();
    }

    bindSideControl(control: HTMLElement): void {
        this.plotRow.appendChild(control);
    }

    animateOffsetTo(offset: number, durationMs = Config.PRESET_TRANSITION_MS): void {
        void durationMs;
        this.setOffset(offset);
    }

    getValue(): number[] {
        return [...this.values];
    }
}
