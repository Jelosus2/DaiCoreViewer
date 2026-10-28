import type { SpineCatalog } from "@/types/viewer";
import type { ChangelogPart } from "@/types/changelog";

const categories = {
    character: "characters",
    asmr: "asmr",
    archive: "archives",
    ungrouped: "ungrouped",
    other: "other"
} as const;

export function parseChangelogText(text: string, catalog: SpineCatalog): ChangelogPart[] {
    const parts: ChangelogPart[] = [];
    const pattern = /\[(character|asmr|archive|ungrouped|other)\]([^\[\]\r\n]+)\[\/\1\]/g;
    let offset = 0;

    for (const match of text.matchAll(pattern))
    {
        parts.push({ text: text.slice(offset, match.index) });

        const category = categories[match[1] as keyof typeof categories];
        const id = match[2].trim();
        const item = catalog[category].find((entry) => entry.id === id);
        const available = item?.options.some((option) => option.render.status === "ready" && option.render.root);

        parts.push(available
            ? { text: item!.name, target: { category, id } }
            : { text: `${item?.name ?? `Asset ${id}`} (unavailable)` });

        offset = match.index + match[0].length;
    }

    parts.push({ text: text.slice(offset) });
    return parts;
}
