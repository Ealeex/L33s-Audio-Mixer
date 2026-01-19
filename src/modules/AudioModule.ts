/**
 * Represents a generic audio processing node in a modular audio system.
 */
export interface INode {
  /** The unique name of the node. */
  readonly name: string;

  /**
   * Initializes the node with the given AudioContext.
   * @param audioContext - The AudioContext used for creating and managing audio nodes.
   * @returns A promise that resolves when initialization is complete.
   */
  init(audioContext: AudioContext): Promise<void>;

  /**
   * Connects this node's output to another AudioNode.
   * @param node - The target AudioNode to connect to.
   */
  connect(node: AudioNode): void;

  /**
   * Disconnects this node's output from a connected AudioNode.
   * @param node - The target AudioNode to disconnect from.
   */
  disconnect(node: AudioNode): void;

  /** The entry point AudioNode of this module (where audio input is received). */
  get entry(): AudioNode;
}

/**
 * Abstract base class for modular audio nodes.
 * Provides a standard structure with an entry and exit GainNode,
 * and hooks for custom audio processing in derived classes.
 */
export abstract class AudioModule implements INode {
  /** The unique name of the module. Must be implemented by subclasses. */
  abstract readonly name: string;

  /** The AudioContext associated with this module. */
  protected audioContext!: AudioContext;

  /** The entry GainNode where audio input enters the module. */
  protected entryNode!: GainNode;

  /** The exit GainNode where audio output leaves the module. */
  protected exitNode!: GainNode;

  /**
   * Initializes the module with an AudioContext, creating the node tree
   * and setting up connections.
   * @param audioContext - The AudioContext to use for audio node creation.
   */
  async init(audioContext: AudioContext) {
    if (this.audioContext) return;
    this.audioContext = audioContext;
    this.entryNode = audioContext.createGain();
    this.exitNode = audioContext.createGain();
    this.createNodes();
    this.setupNodeRoutes();
    await this.setup();
  }

  /**
   * Connects the module's output to another AudioNode.
   * @param node - The AudioNode to connect to.
   */
  connect(node: AudioNode) { this.exitNode.connect(node); }

  /**
   * Disconnects the module's output from a connected AudioNode.
   * @param node - The AudioNode to disconnect from.
   */
  disconnect(node: AudioNode) { this.exitNode.disconnect(node); }

  /**
   * Creates the individual audio nodes used by the module.
   * Subclasses can override this to add their own nodes.
   * This does NOT connect the nodes; connections are handled in setupNodeRoutes().
   */
  protected createNodes() {}

  /**
   * Sets up the default routing of nodes.
   * By default, connects entryNode to exitNode.
   * Can be overridden for custom routing.
   */
  protected setupNodeRoutes() { this.entryNode.connect(this.exitNode); }

  /**
   * Additional asynchronous setup logic for the module.
   * Subclasses can override this to perform async initialization.
   */
  protected async setup() {}

  /** Returns the entry node of the module where audio input is received. */
  get entry(): AudioNode { return this.entryNode; }
}
