type Options = {
    name:string;
    action:()=>void;
}

export class Button {

    // new Button({name:'Options', action:()=>{Runtime.runtime.openOptionsPage()}});

    element!: HTMLDivElement;
    name: string;
    action: Function;

    constructor(opt:Options) {
        this.name = opt.name;
        this.action = opt.action;
        this.element = this.createElement();
        this.element.addEventListener('click', ()=>{this.action()});
    }

    createElement() {
        let elem = document.createElement('div');
        elem.classList.add('button');
        elem.innerHTML = `<p>${this.name}</p>`;
        document.getElementById('wrapper')!.appendChild(elem);
        return elem;
    }

}