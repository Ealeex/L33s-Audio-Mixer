export interface INode {
  readonly name: string;
  init(audioContext: AudioContext): Promise<void> | void;
  connect(node: AudioNode): void;
  disconnect(node: AudioNode): void;
  get entry(): AudioNode;
}

export abstract class AudioModule implements INode {
  
  abstract readonly name: string;
  protected audioContext!: AudioContext;
  protected entryNode!: GainNode;
  protected exitNode!: GainNode;

  async init(audioContext: AudioContext) {
    if (this.audioContext) return;

    this.audioContext = audioContext;
    this.entryNode = audioContext.createGain();
    this.exitNode = audioContext.createGain();

    this.createNodeTree();
    this.setupNodeRoutes();
    await this.setup();
  }

  connect(node: AudioNode) { this.exitNode.connect(node); }
  disconnect(node: AudioNode) { this.exitNode.disconnect(node); }

  protected createNodeTree() {}
  protected setupNodeRoutes() {
    this.entryNode.connect(this.exitNode);
  }
  protected async setup() {}

  get entry(): AudioNode {
    return this.entryNode;
  }
}