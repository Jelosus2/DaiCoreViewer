import type { ViewerCategory } from "./viewer";

export interface ChangelogTarget {
    category: ViewerCategory;
    id: string;
}

export interface ChangelogPart {
    text: string;
    target?: ChangelogTarget;
}

export interface ChangelogRelease {
    id: string;
    date: string;
    title: string;
    sections: Array<{ title: string; lines: string[] }>;
}
