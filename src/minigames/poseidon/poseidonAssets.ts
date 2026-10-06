import { loadSpineUiIndex } from "../uiAssets";

const BUNDLE = "prefabs_uis_spine_70030_skin_poseidon05_spine";

export async function loadPoseidonAssets(): Promise<HTMLImageElement> {
    const index = await loadSpineUiIndex();
    const url = index.bundles[BUNDLE]?.sprites.img_exit;

    if (!url)
        throw new Error("Poseidon UI exit sprite is missing");

    const image = new Image();
    image.src = url;

    await image.decode();

    return image;
}
