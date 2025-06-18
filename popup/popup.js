"use strict";
class UserRangeOption {
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
        let result = await browser.storage.local.get(this.storageName);
        this.inputElem.value = (typeof result[this.storageName] === 'number' ? result[this.storageName] : this.default).toString();
        // Add Listener
        this.inputElem.addEventListener('input', () => {
            const value = parseFloat(this.inputElem.value);
            browser.storage.local.set({ [this.storageName]: value });
            browser.tabs.query({}).then((tabs) => {
                for (const tab of tabs)
                    if (tab.id !== undefined)
                        browser.tabs.sendMessage(tab.id, { action: `set-${this.storageName}`, value });
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
document.addEventListener('DOMContentLoaded', async () => {
    new UserRangeOption({ name: 'Convolver Mix' });
    const eqBands = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    eqBands.forEach(band => {
        new UserRangeOption({ name: `band-${band}`, min: -20, max: 20 });
    });
});
