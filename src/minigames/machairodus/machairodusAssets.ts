import { loadSpineUiIndex, preloadUiImages } from "../uiAssets";

const BUNDLE = "prefabs_uis_spine_30180_skin_machairodus05a_spine";
const BACKGROUNDS = [
    ["textures_bigs_uis_spineui_1", "bg_01_01"],
    ["textures_bigs_uis_spineui_2", "bg_01_02"]
] as const;

export async function loadMachairodusAssets(): Promise<{
    sprites: Record<string, string>;
    backgrounds: [string, string];
    effects: [string, string];
}> {
    const index = await loadSpineUiIndex();
    const sprites = index.schemaVersion === 1 ? index.bundles[BUNDLE]?.sprites : undefined;

    if (!sprites)
        throw new Error("Machairodus UI sprites are missing from the asset index")

    const backgrounds = BACKGROUNDS.map(([bundle, name]) => index.bundles[bundle]?.sprites[name]);
    if (!backgrounds[0] || !backgrounds[1])
        throw new Error("Machairodus background images are missing from the asset index");

    const textures = index.bundles[BUNDLE]?.textures;
    const streak = textures?.FX_Spark_1;
    const flare = textures?.["qc-sanfaguang2"];

    if (!streak || !flare)
        throw new Error("Machairodus target effect textures are missing");

    const required = [
        "img_04_01", "img_04_02", "img_01_01", "img_01_02", "img_01_03",
        "img_99_01", "img_99_02", "img_05_01", "img_exit",
        ...Array.from({ length: 10 }, (_, index) => `img_02_0${index}`),
        ...Array.from({ length: 10 }, (_, index) => `img_03_0${index}`)
    ];

    for (const name of required)
    {
        if (!sprites[name])
            throw new Error(`Machairodus UI sprite ${name} is missing`);
    }

    await preloadUiImages(Object.values(sprites));

    return {
        sprites,
        backgrounds: [backgrounds[0], backgrounds[1]],
        effects: [streak, flare]
    };
}
