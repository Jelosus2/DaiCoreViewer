import type { AudioCue, AudioManifest } from "@/types/audio";
import type { SpineActionItem } from "@/types/spine";

interface AudioSessionOptions {
    assetKey?: string;
    catalogSha256: string;
    baseUrl: string;
    volume: () => number;
    captions: () => boolean;
    onProgress: (completed: number, total: number) => void;
    onCaption: (text: string) => void;
    onBlocked: (blocked: boolean) => void;
}

type PreparedClip = { buffer: AudioBuffer } | { blob: Blob };

export function createAssetAudioSession(options: AudioSessionOptions) {
    const controller = new AbortController();
    const clips = new Map<string, PreparedClip>();
    let manifest: AudioManifest | undefined;
    let context: AudioContext | undefined;
    let gain: GainNode | undefined;
    let voice: AudioBufferSourceNode | undefined;
    let voiceText = "";
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

    async function prepare() {
        if (!options.assetKey)
            return;

        checkActive();

        const raw = await fetchBytes(assetUrl("assets/audio/manifest.json"));
        const data = JSON.parse(new TextDecoder().decode(raw)) as AudioManifest;

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

        context = new AudioContext();
        gain = context.createGain();

        gain.connect(context.destination);
        context.onstatechange = () => {
            if (!destroyed)
                options.onBlocked(context?.state !== "running");
        };

        options.onBlocked(context.state !== "running");
        refreshSettings();

        const pending = [...dependencies.entries()];
        let next = 0;
        let completed = 0;

        options.onProgress(0, pending.length);

        async function worker() {
            while (next < pending.length)
            {
                const [url, cue] = pending[next++]!;
                const bytes = await fetchBytes(assetUrl(url));

                if (bytes.byteLength !== cue.bytes)
                    throw new Error("Audio clip size mismatch");

                const digest = await crypto.subtle.digest("SHA-256", bytes);

                checkActive();

                const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
            ready = true;
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
                voiceText = "";
                options.onCaption("");
            }
        };

        voice = source;
        voiceText = item.hideTxt === 1
            ? ""
            : sound.script2 ?? "";

        source.start();
        options.onCaption(options.captions() ? voiceText : "");
    }

    function unlock() {
        if (destroyed || !context || context.state === "running")
            return Promise.resolve();
        if (unlocking)
            return unlocking;

        unlocking = context.resume().then(() => {
            if (!destroyed)
                options.onBlocked(context?.state !== "running");
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

        options.onCaption(options.captions() ? voiceText : "");
    }

    function destroy() {
        if (destroyed)
            return;

        destroyed = true;
        ready = false;

        controller.abort();
        stopVoice();

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
        unlock,
        refreshSettings,
        destroy
    };
}
