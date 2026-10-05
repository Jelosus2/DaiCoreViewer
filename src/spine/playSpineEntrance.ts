import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { Container, Ticker, MeshSimple, Texture, Assets } from "pixi.js";

type TrackEntry = ReturnType<Spine["state"]["setAnimation"]>;

export interface EntranceClip {
    fps: number;
    duration: number;
    meshes: Array<{
        texture: string | null;
        blend: "normal" | "add";
        uvs: number[];
        indices: number[];
        frames: number[][];
    }>;
}

export interface EntranceEffects {
    schemaVersion: number;
    toWhite: EntranceClip;
    outWhite: EntranceClip;
}

interface LoadedEffects {
    urls: Set<string>;
    ready: Promise<EntranceEffects>;
}


interface EntranceOptions {
    ticker: Ticker;
    wrapper: Container;
    layer: Container;
    effects: EntranceEffects;
    skipTarget: HTMLElement;
    shouldPlay: () => boolean;
    onPlayingChange: (playing: boolean) => void;
    onCenteredChange: () => void;
}

let users = 0;
let shared: LoadedEffects | undefined;
let retiring: Promise<void> | undefined;

export function playSpineEntrance(spines: Spine[], options: EntranceOptions): (() => void) | undefined {
    const candidates = spines.filter((spine) => {
        const animation = spine.skeleton.data.findAnimation("in");
        return animation !== null && animation.duration > 0;
    });

    if (candidates.length === 0 || !options.shouldPlay())
        return undefined;

    const entries: Array<{ spine: Spine; entry: TrackEntry; }> = [];

    let disposed = false;
    let remaining = candidates.length;
    let phase: "in" | "cover" | "reveal" | "finished" = "in";
    let phaseStarted = 0;
    let reset = false;
    let effect: ReturnType<typeof createEntranceEffect> | undefined;

    function clearEntranceTracks() {
        for (const { spine, entry } of entries)
        {
            entry.listener = null;

            if (spine.state.getCurrent(1) !== entry)
                continue;

            spine.state.clearTrack(1);
            spine.skeleton.setToSetupPose();
            spine.update(0);
        }

        entries.length = 0;
    }

    function removeEffect() {
        effect?.view.destroy({ children: true });
        effect = undefined;
    }

    function finish() {
        phase = "finished";

        options.ticker.remove(update);
        options.skipTarget.removeEventListener("pointerdown", skip);

        removeEffect();

        options.wrapper.scale.set(1);
        options.onPlayingChange(false);
    }

    function update() {
        if (disposed || phase === "finished")
            return;

        const now = performance.now();

        if (phase === "in")
        {
            if (remaining !== 0)
                return;

            phase = "cover";
            phaseStarted = now;

            effect = createEntranceEffect(options.effects.toWhite);
            options.layer.addChild(effect.view);

            return;
        }

        const elapsed = now - phaseStarted;

        if (phase === "cover")
        {
            effect?.update(Math.min(elapsed, 350) / 1000);

            if (!reset && elapsed >= 100)
            {
                reset = true;
                clearEntranceTracks();
            }

            if (elapsed < 350)
                return;

            options.onCenteredChange();
            removeEffect();

            options.wrapper.scale.set(1.1);

            effect = createEntranceEffect(options.effects.outWhite);
            options.layer.addChild(effect.view);

            phase = "reveal";
            phaseStarted = now;

            return;
        }

        effect?.update(Math.min(elapsed, 300) / 1000);

        const progress = Math.min(1, Math.max(0, elapsed - 1) / 300);
        options.wrapper.scale.set(1.1 - 0.1 * progress);

        if (elapsed >= 300)
            finish();
    }

    function skip(event: PointerEvent) {
        if (disposed || phase !== "in" || event.button !== 0)
            return;

        for (const { spine, entry } of entries)
        {
            if (spine.state.getCurrent(1) === entry)
                entry.trackTime = entry.animation!.duration;
        }
    }

    options.wrapper.scale.set(1);
    options.onPlayingChange(true);
    options.onCenteredChange();

    for (const spine of candidates)
    {
        spine.skeleton.setToSetupPose();

        const entry = spine.state.setAnimation(1, "in", false);
        entry.mixDuration = 0;
        entry.alpha = 1;
        entry.timeScale = 1;
        entry.trackTime = 0;

        let completed = false;

        entry.listener = {
            complete: () => {
                if (!disposed && !completed)
                {
                    completed = true;
                    remaining--;
                }
            }
        };

        entries.push({ spine, entry });
        spine.update(0);
    }

    options.ticker.add(update, undefined, -10);
    options.skipTarget.addEventListener("pointerdown", skip);

    return () => {
        if (disposed)
            return;

        disposed = true;

        options.ticker.remove(update);
        options.skipTarget.removeEventListener("pointerdown", skip);

        clearEntranceTracks();
        removeEffect();

        options.wrapper.scale.set(1);
    };
}

export function entranceTextureUrls(effects: EntranceEffects): string[] {
    return [...new Set(
        [effects.toWhite, effects.outWhite]
            .flatMap((clip) => clip.meshes)
            .map((mesh) => mesh.texture)
            .filter((url): url is string => url !== null)
    )];
}

export function acquireEntranceEffects() {
    let released = false;
    users++;

    const ready = (retiring ?? Promise.resolve()).then(() => {
        return released ? undefined : getShared();
    });

    function release() {
        if (released)
            return;

        released = true;
        users--;

        retireUnused();
    }

    return { ready, release };
}

function createEntranceEffect(clip: EntranceClip) {
    const view = new Container();
    view.eventMode = "none";

    const meshes = clip.meshes.map((source) => {
        const mesh = new MeshSimple({
            texture: source.texture ? Texture.from(source.texture) : Texture.WHITE,
            vertices: new Float32Array(source.frames[0]!.slice(1)),
            uvs: new Float32Array(source.uvs),
            indices: new Uint32Array(source.indices)
        });

        mesh.blendMode = source.blend;
        mesh.eventMode = "none";
        view.addChild(mesh);

        return { mesh, source };
    });

    function update(seconds: number) {
        const frame = Math.max(0, Math.min(seconds, clip.duration)) * clip.fps;
        const index = Math.floor(frame);
        const fraction = frame - index;

        for (const { mesh, source } of meshes)
        {
            const current = source.frames[Math.min(index, source.frames.length - 1)];
            const next = source.frames[Math.min(index + 1, source.frames.length - 1)];

            mesh.alpha = current[0] + (next[0] - current[0]) * fraction;

            const vertices = mesh.vertices;

            for (let i = 0; i < vertices.length; i++)
                vertices[i] = current[i + 1] + (next[i + 1] - current[i + 1]) * fraction;

            mesh.geometry.getBuffer("aPosition").update();
        }
    }

    update(0);

    return { view, update };
}

function getShared(): Promise<EntranceEffects> {
    if (shared)
        return shared.ready;

    const jsonUrl = "/assets/spine/entrance/entrance-effects.json";
    const urls = new Set([jsonUrl]);

    const ready = Assets.load<EntranceEffects>(jsonUrl).then(async (effects) => {
        if (effects.schemaVersion !== 1)
            throw new Error("Unsupported entrance effects format");

        const textures = entranceTextureUrls(effects);

        for (const url of textures)
            urls.add(url);

        const results = await Promise.allSettled(textures.map((url) => Assets.load(url)));
        const failed = results.find((result) => result.status === "rejected");

        if (failed?.status === "rejected")
            throw failed.reason;

        return effects;
    });

    shared = { urls, ready };

    return ready;
}

function retireUnused() {
    if (users !== 0 || !shared || retiring)
        return;

    const current = shared;

    retiring = current.ready.catch(() => undefined).then(async () => {
        if (users !== 0 || shared !== current)
            return;

        shared = undefined;

        const results = await Promise.allSettled([...current.urls].map((url) => Assets.unload(url)));

        for (const result of results)
        {
            if (result.status === "rejected")
                console.error("Failed to unload an entrance asset:", result.reason);
        }
    }).finally(() => {
        retiring = undefined;
        retireUnused();
    });
}
