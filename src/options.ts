class Vector2 {
    x:number;
    y:number;
    constructor(x:number, y:number) {
        this.x = x;
        this.y = y;
    }
    subtract(that:Vector2) {
        return new Vector2(this.x - that.x, this.y - that.y);
    }
    add(that:Vector2) {
        return new Vector2(this.x + that.x, this.y + that.y);
    }
}

class DragController {

    static worldOffset: Vector2 = new Vector2(window.innerWidth / 2, window.innerHeight / 2);
    static isDragging: boolean = false;
    static lastMousePos: Vector2 | null = null;

    static init() {
        document.addEventListener('mousedown', DragController.onMouseDown);
        document.addEventListener('mouseup', DragController.onMouseUp);
        document.addEventListener('mousemove', DragController.onMouseMove);
    }

    private static onMouseDown(e: MouseEvent) {
        if(NodeWorld.nodes.some(node => node.isDragging)) return;
        DragController.isDragging = true;
        DragController.lastMousePos = new Vector2(e.clientX, e.clientY);
    }

    private static onMouseUp() {
        DragController.isDragging = false;
        DragController.lastMousePos = null;
    }

    private static onMouseMove(e: MouseEvent) {
        if (!DragController.isDragging || !DragController.lastMousePos) return;
        const currentMousePos = new Vector2(e.clientX, e.clientY);
        const delta = currentMousePos.subtract(DragController.lastMousePos);
        DragController.worldOffset = DragController.worldOffset.add(delta);
        DragController.lastMousePos = currentMousePos;
        DragController.updateUI();
    }

    static updateUI() {

        // Update Background Grid
        document.body.style.setProperty('--x-offset', `${DragController.worldOffset.x / 4}px`);
        document.body.style.setProperty('--y-offset', `${DragController.worldOffset.y / 4}px`);

        // Update Nodes
        for (const node of NodeWorld.nodes) node.updatePosition();

        for (const connection of NodeWorld.connections) connection.update();

    }

    static recenter() {
        const bbox = NodeWorld.getBoundingBox();
        if (!bbox) return;

        const center = new Vector2(
            (bbox.min.x + bbox.max.x) / 2,
            (bbox.min.y + bbox.max.y) / 2
        );

        // World offset so that bbox center aligns with viewport center
        DragController.worldOffset.x = window.innerWidth / 2 - center.x;
        DragController.worldOffset.y = window.innerHeight / 2 - center.y;

        DragController.updateUI();
    }

}

interface IUIElement {
    domElement: HTMLElement | null;
    createElement(): void;
}

abstract class UIElement implements IUIElement {
    domElement: HTMLElement | null = null;
    position: Vector2;
    constructor() { this.position = new Vector2(0, 0); }
    abstract createElement(): void;
}

interface UIButtonOptions {
    text: string;
    action: () => void;
}

class UIButton extends UIElement {
    text: string;
    action: () => void;

    constructor(options: UIButtonOptions) {
        super();
        this.text = options.text;
        this.action = options.action;
        this.createElement();
    }

    createElement(): void {
        this.domElement = document.createElement('div');
        this.domElement.classList.add('ui-button');
        this.domElement.textContent = this.text;
        this.domElement.addEventListener('click', this.action);
        document.body.appendChild(this.domElement);
    }
}

class UI {
    
    static domElement: HTMLDivElement;

    static init() {
        this.domElement = document.createElement('div');
        this.domElement.classList.add('user-interface');
        document.body.appendChild(this.domElement);
    }

    static addElement(uiElement: IUIElement) {
        if(!uiElement.domElement) return;
        this.domElement.appendChild(uiElement.domElement);
    }

}

class NodeWorld {
    
    static domElement: HTMLDivElement;
    static nodes: OptionNode[] = [];
    static connectionLayer: SVGSVGElement;
    static connections: NodeConnection[] = [];

    static init() {
        this.domElement = document.createElement('div');
        this.domElement.classList.add('node-world');
        document.body.appendChild(this.domElement);

        // SVG overlay for connections
        this.connectionLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.connectionLayer.style.position = 'absolute';
        this.connectionLayer.style.top = '0';
        this.connectionLayer.style.left = '0';
        this.connectionLayer.style.width = '100%';
        this.connectionLayer.style.height = '100%';
        this.connectionLayer.style.pointerEvents = 'none'; // allows clicks to pass through
        document.body.appendChild(this.connectionLayer);
    }

    static addNode(node:OptionNode) {
        if(!node.domElement) return;
        this.domElement.appendChild(node.domElement);
        this.nodes.push(node);
    }

    // Returns {min: Vector2, max: Vector2}
    static getBoundingBox(): { min: Vector2; max: Vector2 } | null {
        if (this.nodes.length === 0) return null;

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const node of this.nodes) {
            if (!node.domElement) continue;

            const width = node.domElement.offsetWidth;
            const height = node.domElement.offsetHeight;

            // Node position is top-left
            const x = node.position.x;
            const y = node.position.y;

            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x + width > maxX) maxX = x + width;
            if (y + height > maxY) maxY = y + height;
        }

        return {
            min: new Vector2(minX, minY),
            max: new Vector2(maxX, maxY)
        };
    }

}

interface OptionNodeConnectorOptions {
    name: string;
    type: 'input' | 'output';
}

class OptionNodeConnector {

    domElement: HTMLDivElement | null = null;
    position: Vector2 = new Vector2(0, 0);
    name: string;
    type: 'input' | 'output';
    color: string;

    constructor(options: OptionNodeConnectorOptions) {
        this.name = options.name;
        this.type = options.type;
        this.color = 'white';
        // this.color = this.type === 'input' ? 'cyan' : 'red';
        this.createElement();
    }

    createElement() {
        this.domElement = document.createElement('div');
        this.domElement.classList.add('option-node-connector', `option-node-${this.type}`);
        this.domElement.style.backgroundColor = this.color;
    }

    getGlobalPosition(): Vector2 {
        if (!this.domElement) return new Vector2(0,0);

        const rect = this.domElement.getBoundingClientRect();
        return new Vector2(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }

}

interface OptionNodeOptions {
    position?: Vector2;
    connectors?: OptionNodeConnector[];
}

class OptionNode {

    domElement: HTMLDivElement | null = null;
    position: Vector2;
    isDragging: boolean = false;
    lastMousePos: Vector2 | null = null;

    connectors: OptionNodeConnector[] = [];

    inputContainer!: HTMLDivElement;
    outputContainer!: HTMLDivElement;

    constructor(options?: OptionNodeOptions) {
        this.position = options?.position || new Vector2(-100, -150);
        this.connectors = options?.connectors || [];

        this.createElement();
        this.updatePosition();
        this.setupDrag();
        this.createConnectors();
    }

    createElement() {
        this.domElement = document.createElement('div');
        this.domElement.classList.add('option-node');

        // Two containers: left for inputs, right for outputs
        this.inputContainer = document.createElement('div');
        this.inputContainer.classList.add('option-node-input-container');

        this.outputContainer = document.createElement('div');
        this.outputContainer.classList.add('option-node-output-container');

        this.domElement.appendChild(this.inputContainer);
        this.domElement.appendChild(this.outputContainer);
    }

    createConnectors() {
        for (const connector of this.connectors) {
            if (!connector.domElement) continue;

            ConnectorManager.setupConnector(connector);

            // Append to the correct container based on type
            if (connector.type === 'input') {
                this.inputContainer.appendChild(connector.domElement);
            } else {
                this.outputContainer.appendChild(connector.domElement);
            }
        }
    }

    updatePosition() {
        if (!this.domElement) return;
        const width = this.domElement.offsetWidth;
        const height = this.domElement.offsetHeight;

        this.domElement.style.setProperty(
            '--x-offset',
            `${this.position.x + DragController.worldOffset.x - width / 2}px`
        );
        this.domElement.style.setProperty(
            '--y-offset',
            `${this.position.y + DragController.worldOffset.y - height / 2}px`
        );
    }

    move(delta: Vector2) {
        this.position = this.position.add(delta);
        for (const connection of NodeWorld.connections) connection.update();
        this.updatePosition();
    }

    setupDrag() {
        if (!this.domElement) return;

        this.domElement.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.isDragging = true;
            this.lastMousePos = new Vector2(e.clientX, e.clientY);
        });

        document.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.lastMousePos = null;
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging || !this.lastMousePos) return;
            const currentMousePos = new Vector2(e.clientX, e.clientY);
            const delta = currentMousePos.subtract(this.lastMousePos);
            this.move(delta);
            this.lastMousePos = currentMousePos;
        });
    }

}

class NodeConnection {
    from: OptionNodeConnector; // output
    to: OptionNodeConnector | null;   // input can be null while dragging
    domElement: SVGPathElement;
    tempTargetPos?: Vector2;

    constructor(from: OptionNodeConnector, to: OptionNodeConnector | null) {
        this.from = from;
        this.to = to;

        this.domElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
        this.domElement.setAttribute("stroke", "white");
        this.domElement.setAttribute("fill", "transparent");
        this.domElement.setAttribute("stroke-width", "2");

        NodeWorld.connectionLayer.appendChild(this.domElement);
        this.update();
    }

    update(mousePos?: Vector2) {
        const fromPos = this.from.getGlobalPosition();
        const targetPos = mousePos ?? this.to?.getGlobalPosition() ?? fromPos;

        const dx = Math.abs(targetPos.x - fromPos.x) * 0.5;
        const path = `M ${fromPos.x} ${fromPos.y} C ${fromPos.x + dx} ${fromPos.y} ${targetPos.x - dx} ${targetPos.y} ${targetPos.x} ${targetPos.y}`;
        this.domElement.setAttribute("d", path);
    }

    disconnect() {
        this.domElement.remove();
        NodeWorld.connections = NodeWorld.connections.filter(c => c !== this);
    }
}

class ConnectorManager {
    static draggingConnection: {
        from: OptionNodeConnector,
        tempPath: SVGPathElement,
        existingConnection?: NodeConnection
    } | null = null;

    static setupConnector(connector: OptionNodeConnector) {
        if (!connector.domElement) return;

        connector.domElement.addEventListener('mousedown', e => {
            e.stopPropagation();

            const svg = NodeWorld.connectionLayer;

            if (connector.type === 'output') {
                // Create a temporary path for new connections
                const tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
                tempPath.setAttribute("stroke", "white");
                tempPath.setAttribute("fill", "transparent");
                tempPath.setAttribute("stroke-width", "2");
                svg.appendChild(tempPath);

                // Set draggingConnection for a new connection
                ConnectorManager.draggingConnection = { from: connector, tempPath };
            } else {
                // If clicking an input, see if there's an existing connection to drag
                const existing = NodeWorld.connections.find(c => c.to === connector);
                if (!existing) return;

                // Reuse the existing connection path so it can follow the mouse
                ConnectorManager.draggingConnection = { from: existing.from, tempPath: existing.domElement, existingConnection: existing };
            }
        });
    }

    static init() {
        document.addEventListener('mousemove', ConnectorManager.onMouseMove);
        document.addEventListener('mouseup', ConnectorManager.onMouseUp);
    }

    private static onMouseMove(e: MouseEvent) {
        if (!ConnectorManager.draggingConnection) return;

        const mousePos = new Vector2(e.clientX, e.clientY);

        if (ConnectorManager.draggingConnection.existingConnection) {
            ConnectorManager.draggingConnection.existingConnection.update(mousePos);
        } else {
            const fromPos = ConnectorManager.draggingConnection.from.getGlobalPosition();
            const dx = Math.abs(mousePos.x - fromPos.x) * 0.5;
            const path = `M ${fromPos.x} ${fromPos.y} C ${fromPos.x + dx} ${fromPos.y} ${mousePos.x - dx} ${mousePos.y} ${mousePos.x} ${mousePos.y}`;
            ConnectorManager.draggingConnection.tempPath.setAttribute("d", path);
        }
    }

    private static onMouseUp(e: MouseEvent) {
        if (!ConnectorManager.draggingConnection) return;

        const draggingConnection = ConnectorManager.draggingConnection;

        const input = NodeWorld.nodes
            .flatMap(n => n.connectors)
            .find(c => c.type === 'input' && c.domElement?.getBoundingClientRect().left! < e.clientX &&
                                         e.clientX < c.domElement!.getBoundingClientRect().right! &&
                                         c.domElement!.getBoundingClientRect().top! < e.clientY &&
                                         e.clientY < c.domElement!.getBoundingClientRect().bottom!);

        if (input) {
            if (draggingConnection.existingConnection) {
                if (!NodeWorld.connections.some(c => c !== draggingConnection!.existingConnection && c.to === input)) {
                    draggingConnection.existingConnection.to = input;
                    draggingConnection.existingConnection.tempTargetPos = undefined;
                    draggingConnection.existingConnection.update();
                } else {
                    draggingConnection.existingConnection.disconnect();
                }
            } else {
                if (!NodeWorld.connections.some(c => c.to === input)) {
                    const connection = new NodeConnection(draggingConnection.from, input);
                    NodeWorld.connections.push(connection);
                }
            }
        } else if (draggingConnection.existingConnection) {
            draggingConnection.existingConnection.disconnect();
        }

        if (!draggingConnection.existingConnection) draggingConnection.tempPath.remove();
        ConnectorManager.draggingConnection = null;
    }
}

document.addEventListener('DOMContentLoaded', async () => {

    // Initialize drag handling
    DragController.init();
    ConnectorManager.init();

    // Create UI
    UI.init();
    UI.addElement(new UIButton({ text: "Recenter", action: () => { DragController.recenter() }}));

    // Create NodeWorld and nodes
    NodeWorld.init();
    NodeWorld.addNode(new OptionNode({
        connectors: [
            new OptionNodeConnector({name: 'Input1', type: 'input'}),
            new OptionNodeConnector({name: 'Input2', type: 'input'}),
            new OptionNodeConnector({name: 'Output1', type: 'output'}),
            new OptionNodeConnector({name: 'Output2', type: 'output'}),
        ]
    }));
    NodeWorld.addNode(new OptionNode({
        connectors: [
            new OptionNodeConnector({name: 'Input1', type: 'input'}),
            new OptionNodeConnector({name: 'Input2', type: 'input'}),
            new OptionNodeConnector({name: 'Output1', type: 'output'}),
            new OptionNodeConnector({name: 'Output2', type: 'output'}),
        ]
    }));
    NodeWorld.addNode(new OptionNode({
        connectors: [
            new OptionNodeConnector({name: 'Input1', type: 'input'}),
            new OptionNodeConnector({name: 'Input2', type: 'input'}),
            new OptionNodeConnector({name: 'Output1', type: 'output'}),
            new OptionNodeConnector({name: 'Output2', type: 'output'}),
        ]
    }));

    DragController.recenter();

    console.log("Options Page Loaded.");

});
