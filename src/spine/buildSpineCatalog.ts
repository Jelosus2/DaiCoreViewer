import type { SpineCatalog, ViewerItem, ViewerOption, AssetPreviews } from "@/types/viewer";
import type { SpineManifest, SpineModel } from "@/types/spine";
import type { TranslateGameText } from "@/types/localization";

const asmrPlacement: [number, number, number] = [0, 0, 1];

export function buildSpineCatalog(manifest: SpineManifest | null, previews?: AssetPreviews, text: TranslateGameText = (_key, original) => original): SpineCatalog {
    const catalog: SpineCatalog = {
        characters: [],
        asmr: [],
        archives: [],
        ungrouped: [],
        other: []
    };

    if (!manifest)
        return catalog;

    const modelIndex = new Map<number, { characterName: string; roleId: string; originalName: string; model: SpineModel; }>();

    const originalName = (names: { alias: string | null; local: string | null }, fallback: string) => {
        return [names.alias, names.local].find((value) => value?.trim() && value !== "None") ?? fallback;
    };
    const skinSource = (model: SpineModel) => model.skinName?.local?.trim() && model.skinName.local !== "None" ? model.skinName.local : model.render.l2dName;
    const skinName = (model: SpineModel) => text(`skin:${model.modelId}:name`, skinSource(model));

    for (const [roleId, character] of Object.entries(manifest.characters))
    {
        const original = originalName(character.names, roleId);
        const name = text(`character:${roleId}:name`, original);
        const models = Object.values(character.skins).sort((a, b) => a.modelId - b.modelId);
        const options = models.map((model) => ({
            id: String(model.modelId),
            label: `${skinName(model)} · ${model.modelId}`,
            placement: model.l2dPos,
            interaction: model.interaction,
            render: model.render
        }));

        for (const model of models)
            modelIndex.set(model.modelId, { characterName: name, roleId, originalName: original, model });

        const firstReady = options.find((option) => option.render.status === "ready");
        if (!firstReady)
            continue;

        for (const [index, model] of models.entries())
        {
            const option = options[index];
            const skinTitle = skinName(model);
            const title = option.id === firstReady.id ? name : `${name} - ${skinTitle}`;
            const status = option.render.status === "ready" ? "" : " · Unavailable";
            const detail = `${skinTitle} · ${model.modelId}${status}`;

            catalog.characters.push(makeItem(option.id, title, detail, [option], [
                roleId,
                character.names.english,
                text(`character:${roleId}:name`, original, "en"),
                text(`skin:${model.modelId}:name`, skinSource(model), "en"),
                character.names.local,
                character.names.alias,
                model.skinName?.local
            ]));
        }
    }

    for (const item of manifest.special?.asmr ?? [])
    {
        const related = modelIndex.get(item.modelId ?? -1);
        const skinTitle = related ? skinName(related.model) : item.l2dName;
        const original = item.name ?? item.l2dName;
        const title = text(`asmr:${item.id}:name`, original);
        const name = related
            ? `${related.characterName} · ${title}`
            : title;

        addIfReady(catalog.asmr, makeItem(String(item.id), name, `${skinTitle} · ASMR ${item.id}`, [{
            id: String(item.id),
            label: item.l2dName,
            placement: asmrPlacement,
            render: item.render
        }], [original, text(`asmr:${item.id}:name`, original, "en"),
            related?.originalName, related ? text(`character:${related.roleId}:name`, related.originalName, "en") : "",
            related ? skinSource(related.model) : "", related ? text(`skin:${related.model.modelId}:name`, skinSource(related.model), "en") : ""]));
    }

    for (const item of Object.values(manifest.archivePictures))
    {
        const original = item.name ?? item.render.l2dName;

        addIfReady(catalog.archives, makeItem(String(item.id), text(`archive:${item.id}:name`, original), `${item.render.l2dName} · Archive ${item.id}`, [{
            id: String(item.id),
            label: item.render.l2dName,
            placement: item.l2dPos,
            interaction: item.interaction,
            render: item.render
        }], [original, text(`archive:${item.id}:name`, original, "en")]));
    }

    for (const model of Object.values(manifest.ungroupedModels))
    {
        addIfReady(
            catalog.ungrouped,
            makeItem(
                String(model.modelId),
                model.render.l2dName,
                `${skinName(model)} · ${model.modelId}`,
                [{
                    id: String(model.modelId),
                    label: model.render.l2dName,
                    placement: model.l2dPos,
                    interaction: model.interaction,
                    render: model.render
                }], [skinSource(model), text(`skin:${model.modelId}:name`, skinSource(model), "en")]
            )
        );
    }

    for (const asset of manifest.otherSpineAssets ?? [])
    {
        addIfReady(catalog.other, makeItem(`${asset.bundle}:${asset.rootIndex}`, asset.name, asset.bundle, [{
            id: String(asset.rootIndex),
            label: asset.name,
            render: asset.render
        }]));
    }

    for (const [category, prefix] of [["characters", "model"], ["ungrouped", "model"], ["asmr", "asmr"], ["archives", "archive"]] as const)
    {
        for (const item of catalog[category])
        {
            const key = `${prefix}:${item.options[0].id}`;
            item.thumbnail = previews?.images[key];
            item.artwork = previews?.artwork?.[key];
        }
    }

    return catalog;
}

function makeItem(
    id: string,
    name: string,
    detail: string,
    options: ViewerOption[],
    extraSearch: Array<string | null | undefined> = []
): ViewerItem {
    const searchText = [
        id,
        name,
        detail,
        ...options.map((option) => `${option.id} ${option.label}`),
        ...extraSearch
    ].filter((value): value is string => typeof value === "string").join(" ").toLocaleLowerCase();

    return {
        id,
        name,
        detail,
        searchText,
        options
    };
}

function addIfReady(items: ViewerItem[], item: ViewerItem) {
    if (item.options.some((option) => option.render.status === "ready"))
        items.push(item);
}
