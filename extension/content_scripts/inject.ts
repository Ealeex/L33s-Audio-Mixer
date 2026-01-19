import { AudioHandler } from "./AudioHandler";
import { Logger } from "./Logger";

(async () => {
  try {

    if (location.hostname.endsWith("spotify.com")) { Logger.log("Spotify detected — audio processing disabled (DRM-protected)"); return; }

    const handler = new AudioHandler();
    await handler.init();

    const attached = new WeakSet<HTMLMediaElement>();

    const attachOnce = (el: HTMLMediaElement) => {
      if (attached.has(el)) return;
      attached.add(el);
      handler.attach(el);
    };

    window.addEventListener("play", e => { if (e.target instanceof HTMLMediaElement) attachOnce(e.target); }, true);

  } catch (err) { Logger.logErr("Audio handler initialization failed:", err); }
})();
