const log = (...args:any[]) => console.log(`[LeeAudio] (Web) `, ...args);

class UserRangeOption {

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
        let result = await browser.storage.local.get(this.storageName);
        this.inputElem.value = (typeof result[this.storageName] === 'number' ? result[this.storageName] : this.default).toString();

        // Add Listener
        this.inputElem.addEventListener('input', () => {
            const value = parseFloat(this.inputElem.value);
            browser.storage.local.set({ [this.storageName]: value });
            browser.tabs.query({}).then((tabs) => {
                for (const tab of tabs)
                    if (tab.id !== undefined) browser.tabs.sendMessage(tab.id, { action: `set-${this.storageName}`, value });
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

    bands = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    min:number;
    max:number;
    step:number;
    default:number;

    constructor(opts?:{min?:number, max?:number, step?:number, default?:number}) {
        this.min = opts?.min ?? -20;
        this.max = opts?.max ?? 20;
        this.step = opts?.step ?? 1;
        this.default = opts?.default ?? 0;
        this.createElement();
    }

    async createBandRange(frequency:number) {

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
        let result = await browser.storage.local.get(storageName);
        range.value = (typeof result[storageName] === 'number' ? result[storageName] : this.default).toString();

        // Add Listener
        range.addEventListener('input', () => {
            const value = parseFloat(range.value);
            browser.storage.local.set({ [storageName]: value });
            browser.tabs.query({}).then((tabs) => {
                for (const tab of tabs)
                    if (tab.id !== undefined) browser.tabs.sendMessage(tab.id, { action: `set-${storageName}`, value });
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
        this.bands.forEach(async band => { container.appendChild(await this.createBandRange(band)); })
        document.body.appendChild(container);
    }

}

document.addEventListener('DOMContentLoaded', async() => {

    new UserRangeOption({name:'Convolver Mix'});
    new WebEqualizer({min:-20, max:20, step:2});

})