export interface SpineAsset {
    json: string;
    atlas: string;
    initialSkin: string;
    initialAnimation: string;
    loop: boolean;
    timeScale: number;
}

export interface SpineNode {
    name: string;
    parent: number | null;
    activeSelf: boolean;
    transform: {
        position: [number, number, number];
        anchoredPosition?: [number, number];
        scale: [number, number, number];
        rotation: [number, number, number, number];
        anchorMin?: [number, number];
        anchorMax?: [number, number];
        pivot?: [number, number];
    };
    spines: SpineAsset[];
}

export interface SpineRoot {
    name: string;
    nodes: SpineNode[];
}

export interface SpineManifest {
    schemaVersion: number;
    characters: Record<string, {
        skins: Record<string, {
            render: {
                status: string;
                layerCount?: number;
                root?: SpineRoot;
            };
        }>;
    }>;
}
