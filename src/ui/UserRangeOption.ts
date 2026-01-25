import Runtime from "../util/Runtime";

export class UserRangeOption {

    readonly name:string;
    private storageName:string;

    private containerElem!:HTMLDivElement;
    private inputElem!:HTMLInputElement;
    private labelElem!:HTMLLabelElement;
    private min:number;
    private max:number;
    private step:number;
    private default:number;

    constructor(opts:{name:string, min?:number, max?:number, step?:number, default?:number}) {
        this.name = opts.name;
        this.storageName = this.name.toLowerCase().split(' ').join('_');
        this.min = opts.min ?? 0;
        this.max = opts.max ?? 1;
        this.step = opts.step ?? 0.01;
        this.default = opts.default ?? 0.5;

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

        // Add Listener
        this.inputElem.addEventListener('input', () => { this.sendData(); });

    }

    private async sendData() {
        const value = parseFloat(this.inputElem.value);
        if (Number.isNaN(value)) return;
        await Runtime.storage.local.set({ [this.storageName]: value });
        const tabs = await Runtime.tabs.query({});
        for (const tab of tabs) if (tab.id != null) try {
            await Runtime.tabs.sendMessage(tab.id, { action: `set-${this.storageName}`, value });
        } catch {}
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
        document.getElementById('wrapper')!.appendChild(this.containerElem);
    }

    setValue(value:number) {
        value = Math.max(Math.min(value, this.max), this.min);
        this.inputElem.value = value.toString();
        this.sendData();
    }

}