import type { SpineRender, SpinePlacement, SpineActionConfig } from "./spine";

export const viewerCategories = [
    { id: "characters", label: "Characters" },
    { id: "asmr", label: "ASMR" },
    { id: "archives", label: "Archives" },
    { id: "ungrouped", label: "Ungrouped" },
    { id: "other", label: "Other" }
] as const;

export type ViewerCategory = (typeof viewerCategories)[number]["id"];

export interface ViewerOption {
    id: string;
    label: string;
    placement?: SpinePlacement;
    interaction?: SpineActionConfig;
    audioAssetKey?: string | null;
    render: SpineRender;
}

export interface ViewerItem {
    id: string;
    name: string;
    detail: string;
    searchText: string;
    thumbnail?: string;
    artwork?: string;
    options: ViewerOption[];
}

export type SpineCatalog = Record<ViewerCategory, ViewerItem[]>;

export interface AssetPreviews {
    schemaVersion: number;
    catalogSha256: string;
    images: Record<string, string>;
    artwork?: Record<string, string>;
}

export interface ViewerArtwork {
    src: string;
    title: string;
}
