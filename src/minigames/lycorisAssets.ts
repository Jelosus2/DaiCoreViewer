import { loadSpineUiIndex } from "./uiAssets";

export interface LycorisTransform {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number[];
    active: boolean;
    groupAlpha: number;
    imageAlpha: number;
}

export interface LycorisMaterial {
    blend: "source-over" | "lighter";
    tint: number[];
    scroll: number[];
    textureScale: number[];
    textureOffset: number[];
    distortion: number;
    glowScale?: number;
    alphaScale?: number;
    transparency?: number;
    mask?: {
        texture: string;
        scale: number[];
        offset: number[];
        scroll: number[];
    } | null;
}

export interface LycorisParticle extends LycorisMaterial {
    texture: string;
    mesh?: {
        vertices: number[][];
        uv: number[][];
        indices: number[];
    };
    loop: boolean;
    duration: number;
    delay: number;
    speed: number;
    space: number;
    capacity: number;
    rate: number;
    bursts: {
        time: number;
        count: number;
        cycles: number;
        interval: number
    }[];
    lifetime: number[];
    size: number[];
    sizeY: number[] | null;
    rotation: number[];
    startSpeed: number[];
    startColor: number[][];
    shape: {
        enabled: boolean;
        type: number;
        radius: number;
        scale: number[];
        position: number[]
    };
    sizeCurve: number[];
    sizeYCurve: number[];
    colorCurve: number[][][];
    velocity: number[][];
    rotationRate: number[];
}

export interface LycorisNode extends LycorisTransform {
    path: string;
    parent: number;
    anchorMin: number[];
    anchorMax: number[];
    pivot: number[];
    rotation: number[];
    image?: {
        sprite: string | null;
        color: number[];
        type: number;
        border: number[];
        material?: LycorisMaterial
    };
    button?: {
        callback: string;
        cooldown: number
    };
    particle?: LycorisParticle;
}

export interface LycorisUi {
    schemaVersion: number;
    fps: number;
    nodes: LycorisNode[];
    animations: {
        name: string;
        root: number;
        duration: number;
        loop: boolean;
        tracks: {
            node: number;
            property: keyof LycorisTransform | `particle_${number}`;
            frames: number[][]
        }[]
    }[];
    bindings: Record<string, number>;
}

export type LycorisAssets = { ui: LycorisUi; images: Map<string, HTMLImageElement> };

export async function loadLycorisAssets(signal: AbortSignal): Promise<LycorisAssets> {
    const response = await fetch(`${import.meta.env.BASE_URL}assets/spine/ui/lycoris-ui.json`, { signal });
    if (!response.ok)
        throw new Error(`Lycoris UI metadata request failed: ${response.status}`);

    const ui = await response.json() as LycorisUi;
    if (ui.schemaVersion !== 1 || !ui.nodes?.length || !ui.animations?.length || !ui.bindings?.note)
        throw new Error("Unsupported Lycoris UI metadata");

    const index = await loadSpineUiIndex();
    const bundle = index.bundles.prefabs_uis_spine_70400_skin_lycorisradiata03a_spine;

    if (!bundle)
        throw new Error("Lycoris UI assets are missing");

    const urls = new Map<string, string>();

    for (const node of ui.nodes)
    {
        if (node.image?.sprite)
            urls.set(node.image.sprite, bundle.sprites[node.image.sprite]);

        if (node.particle)
        {
            urls.set(node.particle.texture, bundle.textures[node.particle.texture]);
            if (node.particle.mask)
                urls.set(node.particle.mask.texture, bundle.textures[node.particle.mask.texture]);
        }
    }

    for (const name of ["img_02_01", "img_02_02", ...Array.from({ length: 10 }, (_, i) => `img_08_0${i}`)])
        urls.set(name, bundle.sprites[name]);

    const images = new Map<string, HTMLImageElement>();
    const pending = new Set<HTMLImageElement>();

    const abort = () => {
        for (const image of pending)
            image.src = "";

        images.clear();
    };

    signal.addEventListener("abort", abort, { once: true });

    try
    {
        signal.throwIfAborted();

        const results = await Promise.allSettled([...urls].map(async ([name, url]) => {
            if (!url)
                throw new Error(`Lycoris image ${name} is missing`);

            const image = new Image();
            pending.add(image);
            image.src = url;

            await image.decode();

            signal.throwIfAborted();
            pending.delete(image);
            images.set(name, image);
        }));

        const failure = results.find(result => result.status === "rejected");
        if (failure?.status === "rejected")
            throw failure.reason;

        signal.throwIfAborted();
        return { ui, images };
    }
    catch (error)
    {
        abort();
        throw error;
    }
    finally
    {
        signal.removeEventListener("abort", abort);
        pending.clear();
    }
}
