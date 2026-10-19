import { AudioHandler } from "./ui/AudioHandler";
import { Logger } from "./util/Logger";
import Runtime from "./util/Runtime";
import { isSiteEnabled } from "./util/SiteSettings";

const siteEnabled = isSiteEnabled(location.hostname);
const initialize = async (): Promise<boolean> => {
  try {
    if (!await siteEnabled) return false;
    await AudioHandler.init();
    return true;
  } catch (error) {
    Logger.logErr("Audio handler initialization failed:", error);
    return false;
  }
};

Runtime.runtime.onConnect.addListener(port => {
  if (port.name !== AudioHandler.visualizerPortName) return;
  void initialize().then(initialized => {
    if (initialized) AudioHandler.connectVisualizer(port);
    else port.disconnect();
  });
});

window.addEventListener("play", event => {
  if (!(event.target instanceof HTMLMediaElement)) return;
  const media = event.target;
  void initialize().then(initialized => {
    if (initialized) void AudioHandler.attachOnce(media);
  });
}, true);

void siteEnabled.then(enabled => {
  if (!enabled) Logger.log(`Audio processing disabled on ${location.hostname}.`);
}).catch(error => Logger.logErr("Unable to read site power setting:", error));
