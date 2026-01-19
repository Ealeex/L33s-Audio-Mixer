import { AudioModule } from "./AudioModule";

export class Volume extends AudioModule {
    readonly name = 'Pre-Amplifier';
    setVolume(vol: number) { this.entryNode.gain.value = vol; }
}