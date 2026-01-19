import { AudioHandler } from "./classes/AudioHandler";
import { Logger } from "./util/Logger";

(async () => {
  try {
    // Haha Spotify DRM go brrrrrrrrr.
    if (location.hostname.includes("spotify.com")) { Logger.log("Spotify detected — audio processing disabled (DRM-protected)"); return; }
    await AudioHandler.init();
    window.addEventListener("play", e => { if(e.target instanceof HTMLMediaElement) AudioHandler.attachOnce(e.target); }, true);
  } catch (err) { 
    Logger.logErr("Audio handler initialization failed:", err); 
  }
})();
