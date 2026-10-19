# L33's Audio Equalizer

A browser extension that injects an audio processing script into web pages, providing a customizable equalizer and convolver (reverb) effect for all audio elements. Designed for Firefox and Chrome using Manifest V3.

Available on [Firefox](https://addons.mozilla.org/en-US/firefox/addon/l33s-audio-equalizer/) with OperaGX support coming soon.

![Screenshot of L33's Audio Equalizer popup](example.png)

## Features
- **9-band Equalizer**: Fine-tune audio frequencies from 32Hz to 8kHz.
- **Reverb Slider**: Simulates a car's interior using a built-in impulse response sample.
- **Stereo Widener**: Puts you in the song.
- **Basic Presets**: Change all of the settings at the same time.

## Installation
1. Clone or download this repository.
2. Build the extension (optional, for TypeScript changes):
   ```
   npm install
   npm run build
   npm run start (Requires Firefox configured with a profile named "Testing" to be setup.)
   ```
3. Load the `src/` directory as an unpacked extension in your browser:
   - **Firefox**: Use [web-ext](https://github.com/mozilla/web-ext) or load as a temporary add-on.
   - **Chrome**: Go to `chrome://extensions`, enable Developer Mode, and load the `src/` folder.

## Signing

Copy `.env.example` to `.env`, set `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET`
to your Mozilla Add-ons API credentials, then run `npm run sign`. The npm
scripts load `.env` with Node.js, so use Node.js 22.9 or newer. The `.env` file
is ignored by Git; never commit credentials to the repository.

Run `npm run sign:dry-run` to verify that both credential variables are present,
build the extension, and lint it locally. This does not contact AMO or validate
the credentials; `npm run sign` submits the extension for signing.

## Personalizing the mixer

Open the extension popup's settings button to manage visualizer visibility and
presets, configure between 2 and 16 custom equalizer band frequencies, and tune
the global filter Q, gain range, slider increment, and shelf-endpoint behavior.
Save a named preset from the popup or options page; saved presets are available in
the popup's preset selector. Presets include reverb, stereo width, and the EQ
curve while intentionally leaving pre-amp volume untouched. Preset changes ease
the controls and audio into their new values. Preferences are stored locally in
the browser and can be applied or removed from the options page.
