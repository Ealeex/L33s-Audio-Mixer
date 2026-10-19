import Runtime from "./util/Runtime";
import { applyPreset, deletePreset, getCurrentPreset, getPresets, savePreset } from "./util/PresetStore";
import { Logger } from "./util/Logger";
import { Config, Preset } from "./Config";
import {
    createLogSpacedBands,
    defaultEqualizerConfig,
    equalizerBandsKey,
    equalizerConfigKey,
    getEqualizerBands,
    getEqualizerConfig,
    remapEqualizerGains,
    validateEqualizerBands,
    validateEqualizerConfig
} from "./util/EqualizerSettings";

type VisualizerSettings = { frequency: boolean; waveform: boolean };

let navigationAnimationId = 0;

function positionNavigationIndicator(
    previousLink: HTMLAnchorElement | null,
    nextLink: HTMLAnchorElement,
    animate: boolean
): void {
    const nav = nextLink.closest<HTMLElement>(".topnav");
    if (!nav) return;

    const targetLeft = nextLink.offsetLeft;
    const targetWidth = nextLink.offsetWidth;
    const animationId = ++navigationAnimationId;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!animate || reducedMotion || !previousLink || previousLink === nextLink) {
        nav.style.setProperty("--indicator-transition", "none");
        nav.style.setProperty("--indicator-left", `${targetLeft}px`);
        nav.style.setProperty("--indicator-width", `${targetWidth}px`);
        nav.style.setProperty("--indicator-opacity", "1");
        return;
    }

    const stretchLeft = Math.min(previousLink.offsetLeft, targetLeft);
    const stretchRight = Math.max(
        previousLink.offsetLeft + previousLink.offsetWidth,
        targetLeft + targetWidth
    );
    nav.style.setProperty(
        "--indicator-transition",
        "left 170ms cubic-bezier(.22,.8,.28,1), width 170ms cubic-bezier(.22,.8,.28,1)"
    );
    requestAnimationFrame(() => {
        if (animationId !== navigationAnimationId) return;
        nav.style.setProperty("--indicator-left", `${stretchLeft}px`);
        nav.style.setProperty("--indicator-width", `${stretchRight - stretchLeft}px`);
        nav.style.setProperty("--indicator-opacity", "1");
        window.setTimeout(() => {
            if (animationId !== navigationAnimationId) return;
            nav.style.setProperty(
                "--indicator-transition",
                "left 230ms cubic-bezier(.2,.9,.25,1), width 230ms cubic-bezier(.2,.9,.25,1)"
            );
            nav.style.setProperty("--indicator-left", `${targetLeft}px`);
            nav.style.setProperty("--indicator-width", `${targetWidth}px`);
        }, 170);
    });
}

function setActiveNavigation(nextLink: HTMLAnchorElement, animate: boolean): void {
    const previousLink = document.querySelector<HTMLAnchorElement>(".topnav a.active");
    document.querySelectorAll<HTMLAnchorElement>(".topnav a").forEach(link => {
        const active = link === nextLink;
        link.classList.toggle("active", active);
        if (active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    });
    positionNavigationIndicator(previousLink, nextLink, animate);
}

function presetSummary(preset: Preset): string {
    const average = preset.equalizer.reduce((sum, gain) => sum + gain, 0) / preset.equalizer.length;
    const averageQ = preset.q.reduce((sum, q) => sum + q, 0) / preset.q.length;
    return `Reverb ${Math.round(preset.convolver * 100)}% · ${preset.stereoWidener === 0 ? "Mono" : "Stereo"} · Offset ${preset.offset >= 0 ? "+" : ""}${preset.offset.toFixed(1)} dB · ${preset.bands.length} bands · Q avg ${averageQ.toFixed(1)} · EQ ${average >= 0 ? "+" : ""}${average.toFixed(1)} dB`;
}

function makeButton(label: string, className: string, action: () => void): HTMLButtonElement {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    element.className = className;
    element.addEventListener("click", action);
    return element;
}

document.addEventListener("DOMContentLoaded", async () => {
    const navigationLinks = [...document.querySelectorAll<HTMLAnchorElement>(".topnav a")];
    let navigationClickLockUntil = 0;
    let navigationFrame: number | undefined;

    navigationLinks.forEach(link => {
        link.addEventListener("click", () => {
            navigationClickLockUntil = performance.now() + 600;
            setActiveNavigation(link, true);
        });
    });

    const initialLink = navigationLinks.find(link => link.hash === location.hash)
        ?? navigationLinks.find(link => link.classList.contains("active"))
        ?? navigationLinks[0];
    if (initialLink) setActiveNavigation(initialLink, false);

    const trackedSections = [...document.querySelectorAll<HTMLElement>("#overview, #settings, #presets")];
    const syncNavigationToScroll = () => {
        navigationFrame = undefined;
        if (performance.now() < navigationClickLockUntil || trackedSections.length === 0) return;
        const headerOffset = 92;
        const current = trackedSections.reduce(
            (active, section) => section.getBoundingClientRect().top <= headerOffset ? section : active,
            trackedSections[0]
        );
        const nextLink = navigationLinks.find(link => link.hash === `#${current.id}`);
        if (nextLink && !nextLink.classList.contains("active")) setActiveNavigation(nextLink, true);
    };

    window.addEventListener("scroll", () => {
        if (navigationFrame === undefined) navigationFrame = requestAnimationFrame(syncNavigationToScroll);
    }, { passive: true });
    window.addEventListener("resize", () => {
        const activeLink = document.querySelector<HTMLAnchorElement>(".topnav a.active");
        if (activeLink) positionNavigationIndicator(activeLink, activeLink, false);
    });
    window.addEventListener("hashchange", () => {
        const nextLink = navigationLinks.find(link => link.hash === location.hash);
        if (nextLink && !nextLink.classList.contains("active")) setActiveNavigation(nextLink, true);
    });
    syncNavigationToScroll();

    const status = document.getElementById("status-message")!;
    const setStatus = (message: string, isError = false) => {
        status.textContent = message;
        status.classList.toggle("is-error", isError);
    };

    const visualizerResult = await Runtime.storage.local.get("visualizer-settings");
    const storedVisualizers = visualizerResult["visualizer-settings"];
    const visualizers: VisualizerSettings = {
        frequency: storedVisualizers?.frequency !== false,
        waveform: storedVisualizers?.waveform !== false
    };

    const frequencyToggle = document.getElementById("frequency-toggle") as HTMLInputElement;
    const waveformToggle = document.getElementById("waveform-toggle") as HTMLInputElement;
    frequencyToggle.checked = visualizers.frequency;
    waveformToggle.checked = visualizers.waveform;

    const saveVisualizerSettings = async () => {
        visualizers.frequency = frequencyToggle.checked;
        visualizers.waveform = waveformToggle.checked;
        try {
            await Runtime.storage.local.set({ "visualizer-settings": { ...visualizers } });
            setStatus("Visualizer preferences saved.");
        } catch (error) {
            Logger.logErr("Unable to save visualizer preferences:", error);
            setStatus("Could not save visualizer preferences.", true);
        }
    };
    frequencyToggle.addEventListener("change", () => { void saveVisualizerSettings(); });
    waveformToggle.addEventListener("change", () => { void saveVisualizerSettings(); });

    const equalizerForm = document.getElementById("equalizer-bands-form") as HTMLFormElement;
    const equalizerBandCount = document.getElementById("equalizer-band-count") as HTMLInputElement;
    const equalizerBandList = document.getElementById("equalizer-band-list")!;
    let displayedBands = await getEqualizerBands();
    const storedEqualizerConfig = await getEqualizerConfig();
    const equalizerQ = document.getElementById("equalizer-q") as HTMLInputElement;
    const equalizerGainRange = document.getElementById("equalizer-gain-range") as HTMLSelectElement;
    const equalizerGainStep = document.getElementById("equalizer-gain-step") as HTMLSelectElement;
    const equalizerShelfEndpoints = document.getElementById("equalizer-shelf-endpoints") as HTMLInputElement;
    equalizerQ.value = storedEqualizerConfig.q.toString();
    equalizerGainRange.value = storedEqualizerConfig.gainRange.toString();
    equalizerGainStep.value = storedEqualizerConfig.gainStep.toString();
    equalizerShelfEndpoints.checked = storedEqualizerConfig.shelfEndpoints;

    const formatFrequency = (frequency: number) => frequency >= 1000
        ? `${(frequency / 1000).toFixed(frequency % 1000 === 0 ? 0 : 1)}k`
        : `${Math.round(frequency)}`;
    const renderBandInputs = (bands: number[]) => {
        displayedBands = [...bands];
        equalizerBandCount.value = bands.length.toString();
        equalizerBandList.replaceChildren();
        bands.forEach((frequency, index) => {
            const label = document.createElement("label");
            label.className = "equalizer-band-field";
            const caption = document.createElement("span");
            caption.textContent = `Band ${index + 1}`;
            const input = document.createElement("input");
            input.type = "number";
            input.min = "20";
            input.max = "20000";
            input.step = "1";
            input.value = Math.round(frequency).toString();
            input.setAttribute("aria-label", `Band ${index + 1} frequency in hertz`);
            const unit = document.createElement("small");
            unit.textContent = `${formatFrequency(frequency)} Hz`;
            input.addEventListener("input", () => {
                const value = Number(input.value);
                unit.textContent = Number.isFinite(value) ? `${formatFrequency(value)} Hz` : "Hz";
            });
            label.append(caption, input, unit);
            equalizerBandList.appendChild(label);
        });
    };

    renderBandInputs(displayedBands);
    equalizerBandCount.addEventListener("change", () => {
        const requestedCount = Number(equalizerBandCount.value);
        const count = Number.isFinite(requestedCount)
            ? Math.max(Config.MIN_EQ_BANDS, Math.min(Config.MAX_EQ_BANDS, requestedCount))
            : displayedBands.length;
        renderBandInputs(createLogSpacedBands(count, displayedBands[0], displayedBands[displayedBands.length - 1]));
    });
    document.getElementById("reset-equalizer-bands")!.addEventListener("click", () => {
        renderBandInputs([...Config.EQ_BANDS]);
        equalizerQ.value = defaultEqualizerConfig.q.toString();
        equalizerGainRange.value = defaultEqualizerConfig.gainRange.toString();
        equalizerGainStep.value = defaultEqualizerConfig.gainStep.toString();
        equalizerShelfEndpoints.checked = defaultEqualizerConfig.shelfEndpoints;
    });
    equalizerForm.addEventListener("submit", async event => {
        event.preventDefault();
        try {
            const nextBands = validateEqualizerBands(
                [...equalizerBandList.querySelectorAll<HTMLInputElement>("input")].map(input => Number(input.value))
            );
            const nextConfig = validateEqualizerConfig({
                q: Number(equalizerQ.value),
                gainRange: Number(equalizerGainRange.value),
                gainStep: Number(equalizerGainStep.value),
                shelfEndpoints: equalizerShelfEndpoints.checked
            });
            const result = await Runtime.storage.local.get("equalizer");
            const currentGains = Array.isArray(result.equalizer) ? result.equalizer : displayedBands.map(() => 0);
            const nextGains = remapEqualizerGains(displayedBands, currentGains, nextBands)
                .map(gain => Math.max(-nextConfig.gainRange, Math.min(nextConfig.gainRange, gain)));
            await Runtime.storage.local.set({
                [equalizerBandsKey]: nextBands,
                [equalizerConfigKey]: nextConfig,
                equalizer: nextGains
            });
            const tabs = await Runtime.tabs.query({});
            for (const tab of tabs) {
                if (tab.id == null) continue;
                try {
                    await Runtime.tabs.sendMessage(tab.id, { action: `set-${equalizerBandsKey}`, value: nextBands });
                    await Runtime.tabs.sendMessage(tab.id, { action: `set-${equalizerConfigKey}`, value: nextConfig });
                    await Runtime.tabs.sendMessage(tab.id, { action: "set-equalizer", value: nextGains, transitionMs: 320 });
                } catch {}
            }
            renderBandInputs(nextBands);
            setStatus(`Saved ${nextBands.length} bands at Q ${nextConfig.q}. Reopen the popup to refresh its controls.`);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "Could not save the equalizer bands.", true);
        }
    });

    const presetList = document.getElementById("preset-list")!;
    const presetCount = document.getElementById("preset-count")!;

    const renderPresets = async () => {
        const presets = await getPresets();
        presetList.replaceChildren();
        presetCount.textContent = `${Object.keys(presets).length} presets`;
        for (const [name, preset] of Object.entries(presets)) {
            const isBuiltIn = Object.hasOwn(Config.Presets, name);
            const row = document.createElement("article");
            row.className = "preset-row";

            const info = document.createElement("div");
            info.className = "preset-info";
            const title = document.createElement("h3");
            title.textContent = name;
            const summary = document.createElement("p");
            summary.textContent = presetSummary(preset);
            info.append(title, summary);

            const actions = document.createElement("div");
            actions.className = "preset-actions";
            actions.appendChild(makeButton("Apply", "button button-secondary", () => {
                void applyPreset(name, preset).then(() => setStatus(`Applied “${name}”.`)).catch(error => {
                    Logger.logErr("Unable to apply preset:", error);
                    setStatus("Could not apply this preset.", true);
                });
            }));
            if (!isBuiltIn) {
                actions.appendChild(makeButton("Delete", "button button-quiet", () => {
                    void deletePreset(name).then(renderPresets).then(() => setStatus(`Deleted “${name}”.`)).catch(error => {
                        Logger.logErr("Unable to delete preset:", error);
                        setStatus("Could not delete this preset.", true);
                    });
                }));
            } else {
                const tag = document.createElement("span");
                tag.className = "preset-tag";
                tag.textContent = "BUILT IN";
                actions.appendChild(tag);
            }
            row.append(info, actions);
            presetList.appendChild(row);
        }
    };

    const presetForm = document.getElementById("preset-form") as HTMLFormElement;
    const presetName = document.getElementById("new-preset-name") as HTMLInputElement;
    presetForm.addEventListener("submit", async event => {
        event.preventDefault();
        try {
            const name = await savePreset(presetName.value, await getCurrentPreset());
            presetName.value = "";
            await renderPresets();
            setStatus(`Saved “${name}”.`);
        } catch (error) {
            Logger.logErr("Unable to save preset:", error);
            setStatus(error instanceof Error ? error.message : "Could not save this preset.", true);
        }
    });

    await renderPresets();
});
