import Runtime from "../util/Runtime";
import { Config } from "../Config";

export class UserRangeOption {

    readonly name:string;
    private storageName:string;
    private triggerPresetOnManual: boolean;

    private containerElem!:HTMLDivElement;
    private inputElem!:HTMLInputElement;
    private labelElem!:HTMLLabelElement;
    private min:number;
    private max:number;
    private step:number | "any";
    private default:number;
    private mount: HTMLElement;
    private onValueChanged: (value: number) => void;
    private snapToZero: number;
    private queuedSend: number | null = null;
    private sendPending = false;
    private sending = false;
    private pendingManualChange = false;

    constructor(opts:{name:string, storageName?:string, min?:number, max?:number, step?:number | "any", default?:number, triggerPresetOnManual?:boolean, mount?:HTMLElement, onValueChanged?:(value:number)=>void, snapToZero?:number}) {
        this.name = opts.name;
        this.storageName = opts.storageName ?? this.name.toLowerCase().split(' ').join('_');
        this.triggerPresetOnManual = opts.triggerPresetOnManual ?? true;
        this.min = opts.min ?? 0;
        this.max = opts.max ?? 1;
        this.step = opts.step ?? 0.01;
        this.default = opts.default ?? 0.5;
        this.mount = opts.mount ?? document.getElementById('wrapper')!;
        this.onValueChanged = opts.onValueChanged ?? (() => {});
        this.snapToZero = opts.snapToZero ?? 0;

    }

    async init() {
        this.createElement();
        await this.setupStorage();
        return this;
    }

    private async setupStorage() {

        // Load any settings
        let result = await Runtime.storage.local.get(this.storageName);
        this.inputElem.value = (typeof result[this.storageName] === 'number' ? result[this.storageName] : this.default).toString();

        // Add Listener (user input should be treated as manual unless opted out)
        this.inputElem.addEventListener('input', () => this.queueData(this.triggerPresetOnManual));

    }

    private queueData(manual: boolean): void {
        this.pendingManualChange ||= manual;
        if (this.queuedSend !== null) return;
        this.queuedSend = requestAnimationFrame(() => {
            this.queuedSend = null;
            void this.sendData(false);
        });
    }

    private async sendData(manual=false, transitionMs=0) {
        this.sendPending = true;
        this.pendingManualChange ||= manual;
        if (this.sending) return;
        this.sending = true;
        while (this.sendPending) {
            this.sendPending = false;
            let value = parseFloat(this.inputElem.value);
            if (Number.isNaN(value)) continue;
            if (this.snapToZero > 0 && Math.abs(value) <= this.snapToZero) {
                value = 0;
                this.inputElem.value = "0";
            }
            const markManual = this.pendingManualChange;
            this.pendingManualChange = false;
            this.onValueChanged(value);
            await Runtime.storage.local.set({ [this.storageName]: value });
            const tabs = await Runtime.tabs.query({});
            for (const tab of tabs) if (tab.id != null) try {
                await Runtime.tabs.sendMessage(tab.id, { action: `set-${this.storageName}`, value, transitionMs });
            } catch {}
            if (markManual) document.dispatchEvent(new CustomEvent('preset:manual-change'));
        }
        this.sending = false;
    }

    private createElement() {
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
        this.mount.appendChild(this.containerElem);
    }

    setValue(value:number) {
        value = Math.max(Math.min(value, this.max), this.min);
        this.inputElem.value = value.toString();
        // Programmatic changes should persist but not mark as manual adjustments
        void this.sendData(false);
    }

    setManualValue(value:number) {
        value = Math.max(Math.min(value, this.max), this.min);
        this.inputElem.value = value.toString();
        void this.sendData(true);
    }

    animateToValue(value: number, durationMs = Config.PRESET_TRANSITION_MS): void {
        const target = Math.max(Math.min(value, this.max), this.min);
        void durationMs;
        this.inputElem.value = target.toString();
    }

    applyPresetValue(value: number, durationMs = Config.PRESET_TRANSITION_MS): void {
        this.animateToValue(value, durationMs);
        const target = Math.max(Math.min(value, this.max), this.min);
        this.onValueChanged(target);
        void Runtime.storage.local.set({ [this.storageName]: target });
        void Runtime.tabs.query({}).then(async tabs => {
            for (const tab of tabs) if (tab.id != null) try {
                await Runtime.tabs.sendMessage(tab.id, {
                    action: `set-${this.storageName}`,
                    value: target,
                    transitionMs: durationMs
                });
            } catch {}
        });
        if (this.triggerPresetOnManual) document.dispatchEvent(new CustomEvent('preset:manual-change'));
    }

    getValue(): number {
        return parseFloat(this.inputElem.value);
    }

}
