import type { SpineCatalog, ViewerItem, ViewerOption } from "@/types/viewer";
import type { SpineManifest, SpineModel } from "@/types/spine";

export function buildSpineCatalog(manifest: SpineManifest | null): SpineCatalog {
    const catalog: SpineCatalog = {
        characters: [],
        asmr: [],
        archives: [],
        actions: [],
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
            render: model.render
        }));

        for (const model of models)
            modelIndex.set(model.modelId, { characterName: name, model });

        const readyCount = options.filter((option) => option.render.status === "ready").length;
        const detail = `${character.names.alias ?? character.names.local ?? roleId} · ${roleId} · ${readyCount}/${options.length} ready`;

        addIfReady(catalog.characters, makeItem(roleId, name, detail, options, [
            character.names.local,
            character.names.alias
        ]));
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
            render: item.render
        }]));
    }

    for (const item of Object.values(manifest.archivePictures))
    {
        addIfReady(catalog.archives, makeItem(String(item.id), item.name ?? item.render.l2dName, `${item.render.l2dName} · Archive ${item.id}`, [{
            id: String(item.id),
            label: item.render.l2dName,
            render: item.render
        }]));
    }

    for (const action of manifest.special?.actionTransitions ?? [])
    {
        const related = modelIndex.get(action.id);
        const name = related
            ? `${related.characterName} · ${related.model.skinName?.english ?? related.model.render.l2dName}`
            : `Action ${action.id}`;

        // Some action tables repeat the same target. Show each render once.
        const targets = [...new Map(action.targets.map((target) => [target.l2dName, target])).values()];
        const options = targets.map((target, index) => ({
            id: String(index),
            label: target.l2dName,
            render: target.render
        }));

        const kind = action.table.includes("MultiImage")
            ? "Multi-image action"
            : "Spine action";

        addIfReady(catalog.actions, makeItem(`${action.table}:${action.id}`, name, `${kind} · ${action.id}`, options, [action.table]));
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
