import { UserRangeOption } from "./ui/UserRangeOption";
import { WebEqualizer } from "./ui/WebEqualizer";
import { FrequencyDisplay } from "./ui/FrequencyDisplay";
import { WaveformDisplay } from "./ui/WaveformDisplay";
import { PresetManager } from "./ui/PresetManager";
import { Logger } from "./util/Logger";
import { Preset } from "./Config";
import Runtime from "./util/Runtime";

document.addEventListener('DOMContentLoaded', async() => {

    Logger.log("Initializing Popup");

    new FrequencyDisplay();
    new WaveformDisplay();

    // Exempt volume from marking presets as "Custom" when adjusted
    let volumeOpt = await new UserRangeOption({name:'Pre-amp', min:0, max:2, step:0.01, default:1, triggerPresetOnManual:false}).init();
    let convolverOpt = await new UserRangeOption({name:'Convolver Mix', step:0.1}).init();
    let stereoWidthOpt = await new UserRangeOption({name:'Stereo Seperation', min:0, default:1, max:5, step:1}).init();
    let equalizer = await new WebEqualizer({min:-20, max:20, step:2}).init();
    
    const presetManager = new PresetManager();
    presetManager.valueChanged = (preset:Preset) => {
        convolverOpt.setValue(preset.convolver);
        stereoWidthOpt.setValue(preset.stereoWidener);
        equalizer.setValue(preset.equalizer);
    };

    // When user manually changes controls, save current settings as the 'Custom' preset
    document.addEventListener('preset:manual-change', async () => {
        const custom: Preset = {
            convolver: convolverOpt.getValue(),
            stereoWidener: stereoWidthOpt.getValue(),
            equalizer: equalizer.getValue()
        };
        await Runtime.storage.local.set({ 'preset-custom': custom });
    });

})