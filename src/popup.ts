import { UserRangeOption } from "./classes/UserRangeOption";
import { WebEqualizer } from "./classes/WebEqualizer";
import { FrequencyDisplay } from "./classes/FrequencyDisplay";
import { WaveformDisplay } from "./classes/WaveformDisplay";

document.addEventListener('DOMContentLoaded', async() => {
    new UserRangeOption({name:'Pre-amp', min:0, max:2, step:0.01, default:1});
    new UserRangeOption({name:'Convolver Mix', step:0.1});
    new UserRangeOption({name:'Stereo Seperation', min:0, default:1, max:5, step:1});
    new WebEqualizer({min:-20, max:20, step:2});
    new FrequencyDisplay();
    new WaveformDisplay();
})