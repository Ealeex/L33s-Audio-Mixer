# L33's Audio Equalizer

A browser extension that injects an audio processing script into web pages, providing a customizable equalizer and convolver (reverb) effect for all audio elements. Designed for Firefox and Chrome using Manifest V3.

![Screenshot of L33's Audio Equalizer popup](example.png)

## Features
- **10-band Equalizer**: Fine-tune audio frequencies from 32Hz to 16kHz.
- **Reverb Slider**: Simulates a car's interior using a built-in impulse response sample.
- **Popup UI**: Adjust equalizer bands and reverb mix via a modern popup interface.
- **Persistent Settings**: User preferences are saved using browser storage.
- **Works on All Sites**: Injects processing on all URLs with audio elements.

## Installation
1. Clone or download this repository.
2. Build the extension (optional, for TypeScript changes):
   ```
   npm install
   npm run build
   ```
3. Load the `src/` directory as an unpacked extension in your browser:
   - **Firefox**: Use [web-ext](https://github.com/mozilla/web-ext) or load as a temporary add-on.
   - **Chrome**: Go to `chrome://extensions`, enable Developer Mode, and load the `src/` folder.

## Usage
- Click the extension icon to open the popup and adjust audio settings.
- All audio and video elements on web pages will be processed in real time.
- Settings are saved and applied automatically.

## Project Structure
- `src/manifest.json` – Extension manifest (permissions, scripts, popup, icons)
- `src/content_scripts/inject.ts` – Main audio processing logic (equalizer, reverb)
- `src/popup/` – Popup UI (HTML, CSS, JS/TS)
- `src/content_scripts/impulse.wav` – Impulse response sample for the reverb
- `src/icons/` – Extension icons

## Development
- TypeScript is used for main logic and popup scripts.
- Build and run scripts are defined in `package.json`.
- Uses `webextension-polyfill` for cross-browser compatibility.

## Metadata
- **Name:** L33s-Audio-Mixer
- **Version:** 1.0.1
- **Description:** Simple audio equalizer with built in reverb slider. The reverb slider is meant to simulate a car's interior.
- **Author:** Ealeex
- **License:** MPL-2.0
- **Repository:** [GitHub](https://github.com/Ealeex/L33s-Audio-Mixer)
- **Keywords:** photos-music-videos, tabs

---
**Author:** Ealeex
