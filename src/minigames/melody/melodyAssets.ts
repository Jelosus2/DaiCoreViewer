import { loadSpineUiIndex} from "../uiAssets";

export interface MelodyImage {
    id: string;
    sprite: string;
    matrix: number[];
    x: number;
    y: number;
    width: number;
    height: number;
    opacity: number;
}

export interface MelodyUi {
    schemaVersion: number;
    fps: number;
    selection: MelodyImage[];
    hand: MelodyImage;
    results: Record<"win" | "draw" | "lose", MelodyImage[][]>;
    motion: Record<string, { duration: number; frames: number[][] }>;
    loss: {
        backgroundAlpha: number;
        textAlpha: number;
        textY: number;
    }[];
}

export type MelodyImages = Map<string, HTMLImageElement>;

const BUNDLE = "prefabs_uis_spine_20080_skin_melody06_spine";

export async function loadMelodyAssets(): Promise<{ ui: MelodyUi; images: MelodyImages; }> {
    const index = await loadSpineUiIndex();
    const bundle = index.bundles[BUNDLE];

    if (!bundle)
        throw new Error("Melody UI sprites are missing");

    const response = await fetch(`${import.meta.env.BASE_URL}assets/spine/ui/melody-ui.json`);
    if (!response.ok)
        throw new Error(`Melody UI metadata request failed: ${response.status}`);

    const ui = (await response.json()) as MelodyUi;
    if (ui.schemaVersion !== 2 || !ui.loss?.length || !ui.hand || !ui.motion.Anim_zoomIn || !ui.motion.Anim_zoomOut)
        throw new Error("Unsupported Melody UI metadata");

    const required = new Set([
        "img_exit", "img_04_01", "img_04_02", "img_05_01",
        "img_01_01", "img_01_02", "img_01_03", "img_06_04", "img_06_05",
        ...ui.selection.map(image => image.sprite),
        ...Object.values(ui.results).flat(2).map(image => image.sprite)
    ]);

    const urls: Record<string, string> = {};
    for (const name of required)
        urls[name] = bundle.sprites[name];

    urls.lossNoise = bundle.textures["58e74af6878211bbd235dd13b029ebc0"];
    urls.lossMask = bundle.textures.jianbian;
    urls.lossLines = bundle.textures.img_06_04;
    urls.lossDrop = bundle.textures.img_06_05;
    urls.lossDistortion = bundle.textures["2Op_Cell_01"];
    urls.lineDistortion = bundle.textures.Mask_98;

    const images: MelodyImages = new Map();
    const decoded = await Promise.allSettled(Object.entries(urls).map(async ([name, url]) => {
        if (!url)
            throw new Error(`Melody UI image ${name} is missing`);

        const image = new Image();
        image.src = url;

        await image.decode();

        images.set(name, image);
    }));

    const failed = decoded.find((result) => result.status === "rejected");
    if (failed?.status === "rejected")
    {
        images.clear();
        throw failed.reason;
    }

    return { ui, images };
}
