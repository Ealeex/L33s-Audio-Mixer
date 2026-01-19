import { AudioModule } from "./AudioModule";

export class StereoWidener extends AudioModule {

    readonly name = 'Stereo Widener';

    // Nodes
    private sideScaler!: GainNode;
    private splitter!: ChannelSplitterNode;
    private mid!: GainNode;
    private side!: GainNode;
    private leftGainMid!: GainNode;
    private rightGainMid!: GainNode;
    private leftGainSide!: GainNode;
    private rightGainSide!: GainNode;
    private leftOut!: GainNode;
    private rightOut!: GainNode;
    private invertSide!: GainNode;
    private merger!: ChannelMergerNode;

    protected  createNodeTree(): void {
        this.splitter = this.audioContext.createChannelSplitter(2);
        this.mid = this.audioContext.createGain();
        this.side = this.audioContext.createGain();
        this.leftGainMid = this.audioContext.createGain();
        this.rightGainMid = this.audioContext.createGain();
        this.leftGainSide = this.audioContext.createGain();
        this.rightGainSide = this.audioContext.createGain();
        this.sideScaler = this.audioContext.createGain();
        this.leftOut = this.audioContext.createGain();
        this.rightOut = this.audioContext.createGain();
        this.invertSide = this.audioContext.createGain();
        this.merger = this.audioContext.createChannelMerger(2);
    }

    protected  setupNodeRoutes(): void {
        this.splitter.connect(this.leftGainMid, 0);
        this.splitter.connect(this.rightGainMid, 1);
        this.leftGainMid.connect(this.mid);
        this.rightGainMid.connect(this.mid);
        this.splitter.connect(this.leftGainSide, 0);
        this.splitter.connect(this.rightGainSide, 1);
        this.leftGainSide.connect(this.side);
        this.rightGainSide.connect(this.side);
        this.side.connect(this.sideScaler);
        this.mid.connect(this.leftOut);
        this.sideScaler.connect(this.leftOut);
        this.mid.connect(this.rightOut);
        this.sideScaler.connect(this.invertSide);
        this.invertSide.connect(this.rightOut);
        this.leftOut.connect(this.merger, 0, 0);
        this.rightOut.connect(this.merger, 0, 1);
        this.entryNode.connect(this.splitter);
        this.merger.connect(this.exitNode);
    }

    protected  async setup() {
        this.leftGainMid.gain.value = 0.5;
        this.rightGainMid.gain.value = 0.5;
        this.leftGainSide.gain.value = 0.5;
        this.rightGainSide.gain.value = -0.5;
        this.sideScaler.gain.value = 1;
        this.invertSide.gain.value = -1;
    }

    setSeparation(sep: number) {
        this.sideScaler.gain.value = sep;
    }

}