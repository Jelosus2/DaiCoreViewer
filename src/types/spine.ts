export type SpineFraming = "game" | "fit";
export type SpinePlacement = [x: number, y: number, scale: number];

export type SpineActionValue =
    | string
    | number
    | boolean
    | null
    | SpineActionValue[]
    | { [key: string]: SpineActionValue };

export interface SpineAsset {
    json: string;
    atlas: string;
    pages: string[];
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
    reason?: string;
    layerCount?: number;
    root?: SpineRoot;
}

export type SpineActionArea = [
    x: number,
    y: number,
    width: number,
    height: number,
    angleDegrees: number
];

export interface SpineActionItem {
    index: number;
    sType: number;
    gesture: number;
    sName?: string;
    role?: number;
    areas?: SpineActionArea[];
    audioId?: number[] | Record<string, number>;
    hideTxt?: number;
    content?: Record<string, SpineActionValue>;
}

export interface SpineActionConfig {
    id: number;
    key: string | number;
    items: SpineActionItem[];
}

export interface SpineModel {
    modelId: number;
    cardId: number | null;
    skinType: number | null;
    characterKey: string | null;
    englishName: string | null;
    imageName: string | null;
    render: SpineRender;
    l2dPos?: SpinePlacement;
    interaction?: SpineActionConfig;
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

export interface SpineArchivePicture {
    id: number;
    name: string | null;
    imageName: string | null;
    l2dPos?: SpinePlacement;
    interaction?: SpineActionConfig;
    render: SpineRender;
}

export interface SpineAsmr {
    id: number;
    modelId: number | null;
    name: string | null;
    l2dName: string;
    bundle: string;
    present: boolean;
    render: SpineRender;
}

export interface SpineActionTarget {
    l2dName: string;
    bundle: string;
    present: boolean;
    render: SpineRender;
}

export interface SpineActionTransition {
    table: string;
    id: number;
    targets: SpineActionTarget[];
}

export interface SpineOtherAsset {
    bundle: string;
    name: string;
    rootIndex: number;
    render: SpineRender;
}

export interface SpineManifest {
    schemaVersion: number;
    characters: Record<string, SpineCharacter>;
    ungroupedModels: Record<string, SpineModel>;
    archivePictures: Record<string, SpineArchivePicture>;
    special: {
        asmr: SpineAsmr[];
        actionTransitions: SpineActionTransition[];
    } | null;
    otherSpineBundles: string[];
    otherSpineAssets?: SpineOtherAsset[];
}
