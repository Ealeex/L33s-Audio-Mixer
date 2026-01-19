import Runtime from "../util/Runtime";

export class UserRangeOption {

    name:string;
    storageName:string;

    containerElem!:HTMLDivElement;
    inputElem!:HTMLInputElement;
    labelElem!:HTMLLabelElement;
    min:number;
    max:number;
    step:number;
    default:number;

    constructor(opts:{name:string, min?:number, max?:number, step?:number, default?:number}) {

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
        let result = await Runtime.storage.local.get(this.storageName);
        this.inputElem.value = (typeof result[this.storageName] === 'number' ? result[this.storageName] : this.default).toString();

        // Add Listener
        this.inputElem.addEventListener('input', () => {
            const value = parseFloat(this.inputElem.value);
            Runtime.storage.local.set({ [this.storageName]: value });
            Runtime.tabs.query({}).then((tabs) => {
                for (const tab of tabs)
                    if (tab.id !== undefined) Runtime.tabs.sendMessage(tab.id, { action: `set-${this.storageName}`, value });
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