import type { AudioCue, AudioManifest } from "@/types/audio";
import type { SpineActionItem } from "@/types/spine";

import { createAsmrPlayback } from "./createAsmrPlayback";
import { sha256Hex } from "@/utils/sha256";

interface AudioSessionOptions {
    assetKey?: string;
    context?: AudioContext;
    catalogSha256: string;
    baseUrl: string;
    volume: () => number;
    captions: () => boolean;
    translateCaption: (key: string, original: string, audioSha256: string) => string;
    onProgress: (completed: number, total: number) => void;
    onCaption: (text: string) => void;
    onBlocked: (blocked: boolean) => void;
}

type PreparedClip = { buffer: AudioBuffer } | { blob: Blob };

export function createAssetAudioSession(options: AudioSessionOptions) {
    const controller = new AbortController();
    const clips = new Map<string, PreparedClip>();
    const effects = new Set<AudioBufferSourceNode>();
    const buttonTimes = new Map<string, number>();
    let manifest: AudioManifest | undefined;
    let context: AudioContext | undefined = options.context;
    let gain: GainNode | undefined;
    let voice: AudioBufferSourceNode | undefined;
    let voiceText = "";
    let voiceCaptionKey = "";
    let audioSha256 = "";
    let touchIds: number[] = [];
    let nextTouchAt = 0;
    let music: {
        element: HTMLAudioElement;
        source: MediaElementAudioSourceNode;
        url: string;
        pending: boolean;
    } | undefined;
    let asmr: ReturnType<typeof createAsmrPlayback> | undefined;
    let unlocking: Promise<void> | undefined;
    let destroyed = false;
    let ready = false;

    function checkActive() {
        if (destroyed)
            throw new DOMException("Audio session disposed", "AbortError");
    }

    function assetUrl(path: string): string {
        return `${options.baseUrl}${path.replace(/^\//, "")}`;
    }

    async function fetchBytes(url: string): Promise<ArrayBuffer> {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok)
            throw new Error(`Audio request failed: ${response.status}`);

        const bytes = await response.arrayBuffer();
        checkActive();

        return bytes;
    }

    async function prepare(): Promise<boolean> {
        if (!options.assetKey)
            return false;

        checkActive();

        const raw = await fetchBytes(assetUrl("assets/audio/manifest.json"));
        const data = JSON.parse(new TextDecoder().decode(raw)) as AudioManifest;
        audioSha256 = await sha256Hex(raw);

        if (data.schemaVersion !== 1 || data.mode !== "export" || !options.catalogSha256 || data.catalogSha256 !== options.catalogSha256)
            throw new Error("Audio and Spine catalogs do not match");

        const asset = data.assets?.[options.assetKey];
        if (!asset || !Array.isArray(asset.cues) || !data.sounds || !data.cues)
            throw new Error("Audio manifest has no matching asset");

        const dependencies = new Map<string, AudioCue>();

        for (const ref of asset.cues)
        {
            const cue = data.cues[ref.bank]?.[ref.cue];
            if (!cue)
                throw new Error("An audio dependency is missing from the manifest");

            if (cue.state !== "ready")
                continue;

            if (
                !cue.url || !/^\/assets\/audio\/clips\/[a-f0-9]{64}\.webm$/.test(cue.url) ||
                !cue.sha256 || !/^[a-f0-9]{64}$/.test(cue.sha256) ||
                !Number.isInteger(cue.bytes) || cue.bytes! <= 0 ||
                !["voice", "effect", "music", "asmr"].includes(cue.profile ?? "") ||
                !Number.isFinite(cue.durationSeconds) || cue.durationSeconds! < 0
            )
            {
                throw new Error("Invalid audio clip metadata");
            }

            dependencies.set(cue.url, cue);
        }

        context ??= new AudioContext();
        gain = context.createGain();

        gain.connect(context.destination);
        context.onstatechange = () => {
            if (!destroyed)
                updateBlocked();
        };

        updateBlocked();
        refreshSettings();

        const pending = [...dependencies.entries()];
        let next = 0;
        let completed = 0;

        options.onProgress(0, pending.length);

        async function worker() {
            while (next < pending.length)
            {
                const [url, cue] = pending[next++];
                const bytes = await fetchBytes(assetUrl(url));

                if (bytes.byteLength !== cue.bytes)
                    throw new Error("Audio clip size mismatch");

                const hash = await sha256Hex(bytes);

                checkActive();

                if (hash !== cue.sha256)
                    throw new Error("Audio clip hash mismatch");

                if (cue.profile === "asmr" || cue.profile === "music" || cue.durationSeconds! > 120)
                {
                    clips.set(url, { blob: new Blob([bytes], { type: "audio/webm" }) });
                }
                else
                {
                    const buffer = await context!.decodeAudioData(bytes);
                    checkActive();

                    clips.set(url, { buffer });
                }

                options.onProgress(++completed, pending.length);
            }
        }

        try
        {
            await Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker));
            checkActive();

            manifest = data;

            if (options.assetKey.startsWith("model:") && asset.base_voiceID === null && asset.voiceID !== null)
            {
                touchIds = Object.entries(data.sounds)
                    .filter(([, sound]) => sound.group === asset.voiceID && sound.type === 10)
                    .map(([id]) => Number(id));
            }

            nextTouchAt = performance.now() + 180000;
            ready = true;

            return clips.size > 0;
        }
        catch (error)
        {
            destroy();
            throw error;
        }
    }

    function getVolume(): number {
        const value = options.volume();
        return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    }

    function stopVoice() {
        const previous = voice;
        voice = undefined;

        if (previous)
        {
            previous.onended = null;
            previous.stop();
            previous.disconnect();

            nextTouchAt = performance.now() + 180000;
        }

        voiceText = "";
        options.onCaption("");
    }

    function playAction(item: SpineActionItem, recordPosition = 1) {
        if (!ready || destroyed || item.audioId === undefined)
            return;

        stopVoice();

        const ids = item.audioId;
        const keyed = Boolean(item.content?.actions || item.content?.clicks || item.content?.randomActions || item.content?.orderActions);
        let id: number | undefined;

        if (Array.isArray(ids))
        {
            const position = ids.length === 1
                ? 1
                : keyed ? recordPosition : Math.floor(Math.random() * ids.length) + 1;

            id = ids[position - 1];
        }
        else if (keyed)
        {
            id = ids[String(recordPosition)];
        }
        else
        {
            const keys = Object.keys(ids);
            if (!keys.every((_, index) => ids[String(index + 1)] !== undefined))
                return;

            id = ids[String(Math.floor(Math.random() * keys.length) + 1)];
        }

        startVoice(id, item.hideTxt === 1);
    }

    function playTouch(): boolean {
        if (!ready || destroyed || voice || touchIds.length === 0 || !context || context.state !== "running" && !unlocking)
            return false;

        startVoice(touchIds[Math.floor(Math.random() * touchIds.length)], false);

        return voice !== undefined;
    }

    function updateTouch(active: boolean) {
        if (!ready || destroyed || touchIds.length === 0)
            return;

        const now = performance.now();

        if (!active)
        {
            nextTouchAt = now + 180000;
            return;
        }

        if (!voice && now > nextTouchAt)
        {
            nextTouchAt = now + 180000;
            playTouch();
        }
    }

    function playVoice(id: number) {
        if (!ready || destroyed)
            return;

        stopVoice();
        startVoice(id, true);
    }

    function startVoice(id: number | undefined, hideText: boolean) {
        const sound = id === undefined ? undefined : manifest?.sounds[String(id)];
        const cue = sound ? manifest?.cues[sound.cue_sheet]?.[sound.cue_name] : undefined;
        const clip = cue?.url ? clips.get(cue.url) : undefined;

        if (!sound || sound.script2_display === 1 || cue?.state !== "ready" || !clip || !("buffer" in clip) || !context || !gain)
            return;

        if (context.state !== "running" && !unlocking)
        {
            options.onBlocked(true);
            return;
        }

        const source = context.createBufferSource();
        source.buffer = clip.buffer;

        source.connect(gain);
        source.onended = () => {
            source.disconnect();

            if (voice === source)
            {
                voice = undefined;
                nextTouchAt = performance.now() + 180000;
                voiceText = "";
                voiceCaptionKey = "";
                options.onCaption("");
            }
        };

        voice = source;
        voiceText = hideText ? "" : sound.script2 ?? "";
        voiceCaptionKey = `voice:${id}:caption`;

        source.start();
        options.onCaption(options.captions() && voiceText ? options.translateCaption(voiceCaptionKey, voiceText, audioSha256) : "");
    }

    function playEffect(bank: string, name: string) {
        if (!ready || destroyed || !context || !gain)
            return;

        const cue = manifest?.cues[bank]?.[name];
        const clip = cue?.url ? clips.get(cue.url) : undefined;

        if (cue?.state !== "ready" || cue.profile !== "effect" || !clip || !("buffer" in clip))
            return;

        if (context.state !== "running" && !unlocking)
        {
            options.onBlocked(true);
            return;
        }

        const source = context.createBufferSource();
        source.buffer = clip.buffer;

        source.connect(gain);
        effects.add(source);

        source.onended = () => {
            effects.delete(source);
            source.disconnect();
        };

        source.start();
    }

    function playButton(name: string, cooldownMs = 500, key = name) {
        if (destroyed)
            return;

        const now = performance.now();
        if (now < (buttonTimes.get(key) ?? -Infinity))
            return;

        buttonTimes.set(key, now + cooldownMs);

        const button = manifest?.assets[options.assetKey ?? ""]?.extra?.buttons.find((button) => button.button === name);
        if (button?.cue)
            playEffect(button.bank, button.cue);
    }

    function resetButtons() {
        buttonTimes.clear();
    }

    function updateBlocked() {
        if (asmr)
        {
            asmr.update();
            return;
        }

        options.onBlocked(context?.state !== "running" || Boolean(music?.element.paused));
    }

    function startMusic() {
        const active = music;
        if (!active || active.pending || !active.element.paused)
            return;

        active.pending = true;

        void active.element.play().then(() => {
            if (!destroyed && music === active)
                updateBlocked();
        }).catch((error: unknown) => {
            if (destroyed || music !== active)
                return;

            if (error instanceof DOMException && error.name === "NotAllowedError")
            {
                options.onBlocked(true);
            }
            else
            {
                console.error("Failed to play minigame music:", error);
                stopMusic();
            }
        }).finally(() => {
            active.pending = false;
        });
    }

    function stopMusic() {
        const previous = music;
        music = undefined;

        if (!previous)
            return;

        previous.element.onended = null;
        previous.element.onerror = null;
        previous.element.pause();
        previous.element.removeAttribute("src");
        previous.element.load();
        previous.source.disconnect();
        URL.revokeObjectURL(previous.url);

        if (!destroyed)
            updateBlocked();
    }

    function playMusic(bank: string, name: string) {
        if (!ready || destroyed || !context || !gain)
            return;

        const cue = manifest?.cues[bank]?.[name];
        const clip = cue?.url ? clips.get(cue.url) : undefined;

        if (cue?.state !== "ready" || cue.profile !== "music" || !clip || !("blob" in clip))
            return;

        stopMusic();

        const url = URL.createObjectURL(clip.blob);
        const element = new Audio(url);
        element.loop = false;

        const source = context.createMediaElementSource(element);
        source.connect(gain);

        const active = { element, source, url, pending: false };
        music = active;

        element.onended = () => {
            if (music === active)
                stopMusic();
        };

        element.onerror = () => {
            if (music === active)
            {
                console.error("Failed to load minigame music:", element.error);
                stopMusic();
            }
        };

        startMusic();
    }

    function startAsmr(
        createSync: (animation: string) => (time: number, duration: number, delta: number) => void,
        onState: Parameters<typeof createAsmrPlayback>[0]["onState"],
        onError: (error: unknown) => void
    ) {
        const cfg = manifest?.assets[options.assetKey ?? ""]?.asmr;
        const cue = cfg ? manifest?.cues[cfg.cue_sheet2]?.[cfg.cue_name2] : undefined;
        const clip = cue?.url ? clips.get(cue.url) : undefined;

        if (!ready || destroyed || !cfg || cue?.state !== "ready" || !clip || !("blob" in clip) || !context || !gain)
            throw new Error("Full ASMR recording is unavailable");

        asmr?.destroy();

        asmr = createAsmrPlayback({
            blob: clip.blob,
            context,
            gain,
            duration: cue.durationSeconds!,
            words: manifest?.asmrCaptions[String(cfg.voice)]?.arr ?? [],
            captions: options.captions,
            translateCaption: (index, original) => options.translateCaption(`asmr-caption:${cfg.voice}:${index}`, original, audioSha256),
            onCaption: options.onCaption,
            onBlocked: options.onBlocked,
            onFrame: createSync(cfg.e_anim),
            onState,
            onError
        });

        return asmr;
    }

    function unlock() {
        if (destroyed || !context)
            return Promise.resolve();

        startMusic();

        if (context.state === "running")
        {
            asmr?.resume();
            return Promise.resolve();
        }

        if (unlocking)
            return unlocking;

        unlocking = context.resume().then(() => {
            if (!destroyed)
            {
                asmr?.resume();
                updateBlocked();
            }
        }).catch(() => {
            if (!destroyed)
            {
                stopVoice();
                options.onBlocked(true);
            }
        }).finally(() => {
            unlocking = undefined;
        });

        return unlocking;
    }

    function refreshSettings() {
        if (destroyed)
            return;

        if (gain && context)
            gain.gain.setValueAtTime(getVolume(), context.currentTime);

        if (asmr)
            asmr.update();
        else
            options.onCaption(options.captions() && voiceText ? options.translateCaption(voiceCaptionKey, voiceText, audioSha256) : "");
    }

    function destroy() {
        if (destroyed)
            return;

        destroyed = true;
        ready = false;

        controller.abort();

        asmr?.destroy();
        asmr = undefined;

        stopVoice();
        stopMusic();

        for (const source of effects)
        {
            source.onended = null;
            source.stop();
            source.disconnect();
        }

        effects.clear();
        buttonTimes.clear();

        touchIds = [];
        manifest = undefined;

        clips.clear();
        gain?.disconnect();

        if (context)
        {
            context.onstatechange = null;
            void context.close().catch(() => {});
        }
    }

    return {
        prepare,
        playAction,
        playEffect,
        playButton,
        resetButtons,
        playVoice,
        playMusic,
        stopMusic,
        startAsmr,
        playTouch,
        updateTouch,
        unlock,
        refreshSettings,
        destroy
    };
}
