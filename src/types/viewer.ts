import type { SpineRender, SpinePlacement } from "./spine";

export const viewerCategories = [
    { id: "characters", label: "Characters" },
    { id: "asmr", label: "ASMR" },
    { id: "archives", label: "Archives" },
    { id: "actions", label: "Actions" },
    { id: "ungrouped", label: "Ungrouped" },
    { id: "other", label: "Other" }
] as const;

export type ViewerCategory = (typeof viewerCategories)[number]["id"];

export interface ViewerOption {
    id: string;
    label: string;
    placement?: SpinePlacement;
    render: SpineRender;
}

export interface ViewerItem {
    id: string;
    name: string;
    detail: string;
    searchText: string;
    options: ViewerOption[];
}

export type SpineCatalog = Record<ViewerCategory, ViewerItem[]>;
