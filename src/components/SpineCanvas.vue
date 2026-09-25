<script setup lang="ts">
import type { SpineRoot } from "@/types/spine";

import { Spine, SetupPoseBoundsProvider } from "@esotericsoftware/spine-pixi-v8";
import { Application, Assets, Cache, Container } from "pixi.js";
import { onMounted, onUnmounted, ref, useTemplateRef } from "vue";

const props = defineProps<{ root: SpineRoot }>();
const host = useTemplateRef<HTMLDivElement>("host");
const loading = ref(true);
const errorMessage = ref("");

const assetUrls = [...new Set(props.root.nodes.flatMap((node) =>
    node.spines.flatMap((spine) => [spine.json, spine.atlas])
))];

const cacheKeys = new Set<string>();

let disposed = false;
let application: Application | undefined;
let applicationReady = false;
let assetsReady = false;
let observer: ResizeObserver | undefined;

async function releaseAssets() {
    if (!assetsReady)
        return;

    assetsReady = false;
    await Assets.unload(assetUrls);
}

async function setup() {
    const element = host.value;
    if (!element)
        return;

    const app = new Application();
    application = app;

    try
    {
        const backgroundColor = getComputedStyle(document.documentElement).getPropertyValue("--color-stage").trim();

        await app.init({
            width: Math.max(1, element.clientWidth),
            height: Math.max(1, element.clientHeight),
            backgroundColor,
            preference: "webgl",
            resolution: Math.min(window.devicePixelRatio || 1, 2),
            powerPreference: "high-performance",
            autoDensity: true
        });
        applicationReady = true;

        if (disposed)
        {
            destroyView();
            return;
        }

        element.appendChild(app.canvas);

        await Assets.load(assetUrls);
        assetsReady = true;

        if (disposed)
        {
            await releaseAssets();
            return;
        }

        const scene = buildScene(app);
        const resize = () => {
            if (!disposed)
                fit(element, app, scene);
        };

        resize();
        observer = new ResizeObserver(resize);
        observer.observe(element);
        loading.value = false;
    }
    catch (error)
    {
        if (!disposed)
        {
            errorMessage.value = error instanceof Error
                ? error.message
                : String(error);
            loading.value = false;
        }

        destroyView();
        await releaseAssets();
    }
}

function isCentered(point?: [number, number]) {
    return !point || (Math.abs(point[0] - 0.5) < 0.001 && Math.abs(point[1] - 0.5) < 0.001);
}

function buildScene(app: Application) {
    const containers: Container[] = [];
    const parentIndices = new Set(props.root.nodes.map((node) => node.parent));
    let scene: Container | undefined;

    for (const [index, node] of props.root.nodes.entries())
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
            app.stage.addChild(container);
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
        }
    }

    if (!scene)
        throw new Error("Prefab has no root node");

    return scene;
}

function fit(element: HTMLDivElement, app: Application, scene: Container) {
    const width = Math.max(1, element.clientWidth);
    const height = Math.max(1, element.clientHeight);
    app.renderer.resize(width, height);

    const bounds = scene.getLocalBounds();
    const contentWidth = bounds.maxX - bounds.minX;
    const contentHeight = bounds.maxY - bounds.minY;

    if (!Number.isFinite(contentWidth) || !Number.isFinite(contentHeight) || contentWidth <= 0 || contentHeight <= 0)
        return;

    const scale = Math.min((width * 0.85) / contentWidth, (height * 0.85) / contentHeight);

    scene.scale.set(scale);
    scene.position.set(
        width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale,
        height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale
    );
}

function destroyView() {
    observer?.disconnect();
    observer = undefined;

    for (const key of cacheKeys)
        Cache.remove(key);

    cacheKeys.clear();

    if (applicationReady && application)
    {
        application.destroy(true, { children: true });
        applicationReady = false;
    }
}

onMounted(() => {
    void setup();
});

onUnmounted(() => {
    disposed = true;
    destroyView();
    void releaseAssets().catch(console.error);
});
</script>

<template>
    <div class="relative">
        <div ref="host" class="h-full w-full"></div>

        <p
            v-if="loading"
            class="absolute inset-0 grid place-items-center text-muted"
        >
            Loading Spine assets...
        </p>
        <p
            v-else-if="errorMessage"
            role="alert"
            class="absolute inset-0 grid place-items-center p-6 text-red-300"
        >
            {{ errorMessage }}
        </p>
    </div>
</template>
