export interface SpineUiAssetIndex {
    schemaVersion: number;
    bundles: Record<string, {
        sprites: Record<string, string>;
        textures: Record<string, string>;
    }>;
}

export async function loadSpineUiIndex(): Promise<SpineUiAssetIndex> {
    const response = await fetch(`${import.meta.env.BASE_URL}assets/spine/ui/ui-assets.json`);
    if (!response.ok)
        throw new Error(`Spine UI index request failed: ${response.status}`);

    const index = (await response.json()) as SpineUiAssetIndex;
    if (index.schemaVersion !== 1 || !index.bundles)
        throw new Error("Unsupported Spine UI asset index");

    return index;
}

export async function preloadUiImages(urls: readonly string[]) {
    await Promise.all([...new Set(urls)].map(async (url) => {
        const image = new Image();
        image.src = url;

        await image.decode();
    }));
}
