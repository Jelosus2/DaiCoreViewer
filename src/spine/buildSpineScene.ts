import type { SpineRoot } from "@/types/spine";

import { Spine, SetupPoseBoundsProvider } from "@esotericsoftware/spine-pixi-v8";
import { Container } from "pixi.js";

export function buildSpineScene(root: SpineRoot, stageParent: Container, cacheKeys: Set<string>) {
    const containers: Container[] = [];
    const instances: Spine[] = [];
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
        const [x, y] = transform.anchoredPosition ?? [transform.position[0], transform.position[1]];

        container.position.set(x, -y);
        container.scale.set(transform.scale[0], transform.scale[1]);
        container.rotation = -2 * Math.atan2(transform.rotation[2], transform.rotation[3]);
        container.visible = node.activeSelf;

        if (node.parent === null)
        {
            if (scene)
                throw new Error("Prefab has more than one root");

            scene = container;
            stageParent.addChild(container);
        }
        else
        {
            const parent = containers[node.parent];
            if (!parent)
                throw new Error(`Invalid parent for ${node.name}`);

            parent.addChild(container);
        }

        containers.push(container);

        for (const source of node.spines) {
            const instance = Spine.from({
                skeleton: source.json,
                atlas: source.atlas,
                boundsProvider: new SetupPoseBoundsProvider()
            });

            cacheKeys.add(`${source.json}-${source.atlas}-1`);

            if (source.initialSkin)
                instance.skeleton.setSkinByName(source.initialSkin);
            if (source.initialAnimation)
                instance.state.setAnimation(0, source.initialAnimation, source.loop);

            instance.state.timeScale = source.timeScale;

            container.addChild(instance);
            instances.push(instance);
        }
    }

    if (!scene)
        throw new Error("Prefab has no root node");

    return instances;
}

function isCentered(point?: [number, number]) {
    return !point || (Math.abs(point[0] - 0.5) < 0.001 && Math.abs(point[1] - 0.5) < 0.001);
}
