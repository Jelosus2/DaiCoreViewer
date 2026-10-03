import { loadSpineUiIndex, preloadUiImages } from "./uiAssets";

const BUNDLE = "prefabs_uis_spine_75010_skin_vodkamirror03_spine";
const REQUIRED = ["1", "2", "3", "4"] as const;

export async function loadVodkaAssets(): Promise<Record<string, string>> {
    const index = await loadSpineUiIndex();
    const sprites = index.bundles[BUNDLE]?.sprites;

    if (!sprites)
        throw new Error("Vodka UI sprites are missing from the asset index");

    for (const name of REQUIRED)
    {
        if (!sprites[name])
            throw new Error(`Vodka UI sprite ${name} is missing`);
    }

    await preloadUiImages(REQUIRED.map((name) => sprites[name]));

    return sprites;
}
