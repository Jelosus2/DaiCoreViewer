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
    activeInitially: boolean;
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

export interface SpineRender {
    l2dName: string;
    bundle: string;
    status: string;
    layerCount?: number;
    root?: SpineRoot;
}

export interface SpineModel {
    modelId: number;
    cardId: number | null;
    skinType: number | null;
    characterKey: string | null;
    englishName: string | null;
    imageName: string | null;
    render: SpineRender;
    skinName?: {
        local: string;
        english: string | null;
    };
}

export interface SpineCharacter {
    roleId: number;
    names: {
        english: string | null;
        local: string | null;
        alias: string | null;
    };
    skins: Record<string, SpineModel>;
}

export interface SpineManifest {
    schemaVersion: number;
    characters: Record<string, SpineCharacter>;
}
