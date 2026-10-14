import type { SpineCatalog, ViewerItem, ViewerOption, AssetPreviews } from "@/types/viewer";
import type { SpineManifest, SpineModel } from "@/types/spine";

export function buildSpineCatalog(manifest: SpineManifest | null, previews?: AssetPreviews): SpineCatalog {
    const catalog: SpineCatalog = {
        characters: [],
        asmr: [],
        archives: [],
        ungrouped: [],
        other: []
    };

    if (!manifest)
        return catalog;

    const modelIndex = new Map<number, { characterName: string; model: SpineModel; }>();

    for (const [roleId, character] of Object.entries(manifest.characters))
    {
        const name = character.names.english ?? character.names.alias ?? character.names.local ?? roleId;
        const models = Object.values(character.skins).sort((a, b) => a.modelId - b.modelId);
        const options = models.map((model) => ({
            id: String(model.modelId),
            label: `${model.skinName?.english ?? model.skinName?.local ?? model.render.l2dName} · ${model.modelId}`,
            placement: model.l2dPos,
            interaction: model.interaction,
            render: model.render
        }));

        for (const model of models)
            modelIndex.set(model.modelId, { characterName: name, model });

        const firstReady = options.find((option) => option.render.status === "ready");
        if (!firstReady)
            continue;

        for (const [index, model] of models.entries())
        {
            const option = options[index];
            const skinTitle = model.skinName?.english ?? model.skinName?.local ?? model.render.l2dName;
            const title = option.id === firstReady.id ? name : `${name} - ${skinTitle}`;
            const status = option.render.status === "ready" ? "" : " · Unavailable";
            const detail = `${skinTitle} · ${model.modelId}${status}`;

            catalog.characters.push(makeItem(option.id, title, detail, [option], [
                roleId,
                character.names.local,
                character.names.alias,
                model.skinName?.local
            ]));
        }
    }

    for (const item of manifest.special?.asmr ?? [])
    {
        const related = modelIndex.get(item.modelId ?? -1);
        const skinTitle = related?.model.skinName?.english ?? related?.model.skinName?.local ?? item.l2dName;
        const name = related
            ? `${related.characterName} · ${skinTitle}`
            : `ASMR ${item.id}`;

        addIfReady(catalog.asmr, makeItem(String(item.id), name, `${item.name ?? item.l2dName} · ASMR ${item.id}`, [{
            id: String(item.id),
            label: item.l2dName,
            placement: [0, 0, 1],
            render: item.render
        }]));
    }

    for (const item of Object.values(manifest.archivePictures))
    {
        addIfReady(catalog.archives, makeItem(String(item.id), item.name ?? item.render.l2dName, `${item.render.l2dName} · Archive ${item.id}`, [{
            id: String(item.id),
            label: item.render.l2dName,
            placement: item.l2dPos,
            interaction: item.interaction,
            render: item.render
        }]));
    }

    for (const model of Object.values(manifest.ungroupedModels))
    {
        addIfReady(
            catalog.ungrouped,
            makeItem(
                String(model.modelId),
                model.render.l2dName,
                `${model.skinName?.english ?? model.skinName?.local ?? "Model"} · ${model.modelId}`,
                [{
                    id: String(model.modelId),
                    label: model.render.l2dName,
                    placement: model.l2dPos,
                    interaction: model.interaction,
                    render: model.render
                }]
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
