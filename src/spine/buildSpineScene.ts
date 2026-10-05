import type { SpineRoot } from "@/types/spine";

import { Spine, SetupPoseBoundsProvider } from "@esotericsoftware/spine-pixi-v8";
import { Container, Sprite } from "pixi.js";

export interface BuiltSpineScene {
    spines: Spine[];
    nodes: Container[];
    spineNodes: Map<Spine, number>;
}

export function buildSpineScene(root: SpineRoot, stageParent: Container, cacheKeys: Set<string>) {
    const containers: Container[] = [];
    const contentParents: Container[] = [];
    const spines: Spine[] = [];
    const spineNodes = new Map<Spine, number>();
    const parentIndices = new Set(root.nodes.map((node) => node.parent));
    let scene: Container | undefined;

    for (const [index, node] of root.nodes.entries())
    {
        const transform = node.transform;
        const hasChildren = parentIndices.has(index);
        const isEmptyLeaf = node.spines.length === 0 && !hasChildren;

        if (node.activeInitially && !isEmptyLeaf)
        {
            if (!isCentered(transform.anchorMin) || !isCentered(transform.anchorMax))
                throw new Error(`Unsupported UI anchors in ${node.name}`);
            if (hasChildren && !isCentered(transform.pivot))
                throw new Error(`Unsupported UI pivot in ${node.name}`);
            if (Math.abs(transform.rotation[0]) > 0.0001 || Math.abs(transform.rotation[1]) > 0.0001)
                throw new Error(`Unsupported 3D rotation in ${node.name}`);
        }

        const container = new Container();
        const parentTransform = node.parent === null
            ? undefined
            : root.nodes[node.parent]?.transform;

        let [x, y] = transform.anchoredPosition ?? [transform.position[0], transform.position[1]];

        if (
            transform.anchoredPosition && parentTransform?.sizeDelta &&
            isCentered(transform.anchorMin) && isCentered(transform.anchorMax) &&
            isCentered(parentTransform.anchorMin) && isCentered(parentTransform.anchorMax)
        )
        {
            const pivot = parentTransform.pivot ?? [0.5, 0.5];

            x += (0.5 - pivot[0]) * parentTransform.sizeDelta[0];
            y += (0.5 - pivot[1]) * parentTransform.sizeDelta[1];
        }

        container.position.set(x, -y);
        container.scale.set(transform.scale[0], transform.scale[1]);
        container.rotation = -2 * Math.atan2(transform.rotation[2], transform.rotation[3]);
        container.visible = node.activeSelf;

        if (node.parent === null)
        {
            container.position.set(0, 0);
            container.scale.set(1);
            container.rotation = 0;

            if (scene)
                throw new Error("Prefab has more than one root");

            scene = container;
            stageParent.addChild(container);
        }
        else
        {
            const parent = contentParents[node.parent];
            if (!parent)
                throw new Error(`Invalid parent for ${node.name}`);

            parent.addChild(container);
        }

        containers.push(container);

        const content = node.mask ? new Container() : container;
        if (node.mask)
        {
            const mask = makeImage(node.mask, node);

            container.addChild(content, mask);
            content.setMask({ mask, inverse: false, channel: "alpha" });
        }

        contentParents.push(content);

        if (node.image)
            content.addChild(makeImage(node.image, node));

        for (const source of node.spines) {
            const instance = Spine.from({
                skeleton: source.json,
                atlas: source.atlas,
                boundsProvider: new SetupPoseBoundsProvider()
            });

            cacheKeys.add(`${source.json}-${source.atlas}-1`);

            instance.state.data.defaultMix = source.defaultMix ?? 0;

            for (const mix of source.animationMixes ?? [])
                instance.state.data.setMix(mix.from, mix.to, mix.duration);

            if (source.initialSkin)
                instance.skeleton.setSkinByName(source.initialSkin);
            if (source.initialAnimation)
                instance.state.setAnimation(0, source.initialAnimation, source.loop);

            instance.state.timeScale = source.timeScale;

            content.addChild(instance);
            spines.push(instance);
            spineNodes.set(instance, index);
        }
    }

    if (!scene)
        throw new Error("Prefab has no root node");

    return { spines, nodes: containers, spineNodes };
}

function makeImage(url: string, node: SpineRoot["nodes"][number]): Sprite {
    const size = node.transform.sizeDelta;
    if (!size)
        throw new Error(`Missing image size in ${node.name}`);

    const sprite = Sprite.from(url);
    const pivot = node.transform.pivot ?? [0.5, 0.5];

    sprite.anchor.set(pivot[0], pivot[1]);
    sprite.width = size[0];
    sprite.height = size[1];
    sprite.eventMode = "none";

    return sprite;
}

function isCentered(point?: [number, number]) {
    return !point || (Math.abs(point[0] - 0.5) < 0.001 && Math.abs(point[1] - 0.5) < 0.001);
}
