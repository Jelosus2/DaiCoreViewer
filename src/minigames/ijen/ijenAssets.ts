import type { IjenArrow } from "./createIjenMinigame";

import { loadSpineUiIndex } from "../uiAssets";

export interface IjenTransform {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number[];
    euler: number[];
}

export interface IjenParticle {
    blend: "source-over" | "lighter";
    texture: string;
    capacity: number;
    speed: number;
    duration: number;
    prewarm: boolean;
    rate: number;
    bursts: { time: number; count: number }[];
    lifetime: number[];
    size: number[];
    sizeY: number | null;
    rotation: number[];
    rotationRate: number[];
    velocityY: number;
    shape: { type: number; size: number[]; radius: number };
    sizeCurve: number[];
    sizeYCurve: number[] | null;
    alpha: number[][][] | null;
}

export interface IjenNode extends IjenTransform {
    path: string;
    parent: number;
    active: boolean;
    anchorMin: number[];
    anchorMax: number[];
    pivot: number[];
    image?: { sprite: string | null; color: number[] };
    mask?: boolean;
    showMask?: boolean;
    particle?: IjenParticle;
    distortion?: { texture: string; scale: number[]; offset: number[]; amount: number; scroll: number[] };
}

export interface IjenAnimation {
    name: string;
    duration: number;
    loop: boolean;
    blendIn?: number;
    blendOut?: number;
    exitTime?: number;
    tracks: { node: number; property: keyof IjenTransform; frames: number[][] }[];
}

export interface IjenUi {
    schemaVersion: number;
    fps: number;
    nodes: IjenNode[];
    animations: IjenAnimation[];
    arrow: IjenArrow;
    bindings: Record<"btnHit" | "btnBack" | "arrow" | "waves" | "txtNum1" | "txtNum2", number>;
}

export type IjenAssets = { ui: IjenUi; images: Map<string, HTMLImageElement> };

export async function loadIjenAssets(signal: AbortSignal): Promise<IjenAssets> {
    const response = await fetch(`${import.meta.env.BASE_URL}assets/spine/ui/ijen-ui.json`, { signal });
    if (!response.ok)
        throw new Error(`Ijen UI metadata request failed: ${response.status}`);

    const ui = await response.json() as IjenUi;
    if (ui.schemaVersion !== 1 || !ui.nodes?.length || !ui.animations?.length || !ui.bindings || !ui.arrow || ui.arrow.duration <= 0)
        throw new Error("Unsupported Ijen UI metadata");

    const index = await loadSpineUiIndex();
    const bundle = index.bundles.prefabs_uis_spine_60350_skin_ijen03_spine;

    if (!bundle)
        throw new Error("Ijen UI assets are missing");

    const urls = new Map<string, string>();

    for (const node of ui.nodes)
    {
        if (node.image?.sprite)
            urls.set(node.image.sprite, bundle.sprites[node.image.sprite]);

        if (node.particle)
            urls.set(node.particle.texture, bundle.textures[node.particle.texture]);

        if (node.distortion)
            urls.set(node.distortion.texture, bundle.textures[node.distortion.texture]);
    }

    for (let digit = 0; digit <= 9; digit++)
        urls.set(`img_01_0${digit}`, bundle.sprites[`img_01_0${digit}`]);

    const images = new Map<string, HTMLImageElement>();
    const pending = new Set<HTMLImageElement>();

    const abort = () => {
        for (const image of pending)
            image.src = "";

        images.clear();
    };

    signal.addEventListener("abort", abort, { once: true });

    try {
        signal.throwIfAborted();

        const results = await Promise.allSettled([...urls].map(async ([name, url]) => {
            if (!url)
                throw new Error(`Ijen image ${name} is missing`);

            const image = new Image();
            pending.add(image);
            image.src = url;

            await image.decode();

            signal.throwIfAborted();

            pending.delete(image);
            images.set(name, image);
        }));

        const failed = results.find(result => result.status === "rejected");
        if (failed?.status === "rejected")
            throw failed.reason;

        signal.throwIfAborted();

        return { ui, images };
    } catch (error) {
        abort();
        throw error;
    } finally {
        signal.removeEventListener("abort", abort);
        pending.clear();
    }
}
