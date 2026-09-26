<script setup lang="ts">
import type { SpineRoot, SpinePlacement, SpineFraming, SpineActionConfig } from "@/types/spine";

import { buildSpineScene } from "@/spine/buildSpineScene";
import { createSpineInteractions } from "@/spine/createSpineInteractions";
import { Application, Assets, Cache, Container } from "pixi.js";
import { onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";

const props = defineProps<{
    root: SpineRoot;
    placement?: SpinePlacement;
    framing: SpineFraming;
    interaction?: SpineActionConfig;
    showHotspots: boolean;
}>();

const host = useTemplateRef<HTMLDivElement>("host");
const loading = ref(true);
const errorMessage = ref("");
const zoom = ref(1);

const assetUrls = [...new Set(props.root.nodes.flatMap((node) =>
    node.spines.flatMap((spine) => [spine.json, spine.atlas])
))];

const pageUrls = [...new Set(props.root.nodes.flatMap((node) =>
    node.spines.flatMap((spine) => spine.pages)
))];

const cacheKeys = new Set<string>();
const viewOffset = { x: 0, y: 0 };

let disposed = false;
let application: Application | undefined;
let applicationReady = false;
let assetsReady = false;
let observer: ResizeObserver | undefined;
let reframe: (() => void) | undefined;
let activeCamera: Container | undefined;
let interactions: ReturnType<typeof createSpineInteractions> | undefined;

watch([() => props.framing, () => props.placement], resetZoom);

watch(() => props.showHotspots, (show) => {
    interactions?.setDebugVisible(show);
});

async function releaseAssets() {
    if (!assetsReady)
        return;

    assetsReady = false;

    try
    {
        await Assets.unload(assetUrls);
    }
    finally
    {
        await Assets.loader.unload(pageUrls);
    }
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

        const camera = new Container();
        const portrait = new Container();
        const artLayer = new Container();
        const hotspotLayer = new Container();

        app.stage.addChild(camera);
        camera.addChild(portrait);
        portrait.addChild(artLayer, hotspotLayer);

        const spines = buildSpineScene(props.root, artLayer, cacheKeys);
        if (spines.length === 1 && props.interaction)
            interactions = createSpineInteractions(hotspotLayer, spines[0], props.interaction, props.showHotspots);

        activeCamera = camera;

        const resize = () => {
            if (!disposed)
                frame(element, app, camera, portrait, artLayer, props.placement, props.framing);
        };

        reframe = resize;
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

function resetZoom() {
    zoom.value = 1;
    viewOffset.x = 0;
    viewOffset.y = 0;
    reframe?.();
}

function setZoom(value: number, x?: number, y?: number) {
    const next = Math.min(8, Math.max(0.25, value));
    if (next === zoom.value)
        return;

    const element = host.value;
    const camera = activeCamera;
    const anchorX = x ?? (element?.clientWidth ?? 0) / 2;
    const anchorY = y ?? (element?.clientHeight ?? 0) / 2;

    const oldScale = camera?.scale.x ?? 0;
    const localX = oldScale > 0 ? (anchorX - camera!.position.x) / oldScale : 0;
    const localY = oldScale > 0 ? (anchorY - camera!.position.y) / oldScale : 0;

    zoom.value = next;
    reframe?.();

    if (camera && oldScale > 0)
    {
        const shiftX = anchorX - (camera.position.x + localX * camera.scale.x);
        const shiftY = anchorY - (camera.position.y + localY * camera.scale.y);

        viewOffset.x += shiftX;
        viewOffset.y += shiftY;

        camera.position.set(camera.position.x + shiftX, camera.position.y + shiftY);
    }
}

function frame(
    element: HTMLDivElement,
    app: Application,
    camera: Container,
    portrait: Container,
    artLayer: Container,
    placement: SpinePlacement | undefined,
    framing: SpineFraming
) {
    const width = Math.max(1, element.clientWidth);
    const height = Math.max(1, element.clientHeight);
    app.renderer.resize(width, height);

    portrait.position.set(0, 0);
    portrait.scale.set(1);

    if (framing === "game" && placement)
    {
        portrait.position.set(placement[0], -placement[1]);
        portrait.scale.set(placement[2]);

        const canvasScale = Math.min(width / 1920, height / 1080);
        camera.scale.set(canvasScale * zoom.value);
        camera.position.set(width / 2 + viewOffset.x, height / 2 + viewOffset.y);
        return;
    }

    const bounds = artLayer.getLocalBounds();
    const contentWidth = bounds.maxX - bounds.minX;
    const contentHeight = bounds.maxY - bounds.minY;

    if (!Number.isFinite(contentWidth) || !Number.isFinite(contentHeight) || contentWidth <= 0 || contentHeight <= 0)
        return;

    const scale = Math.min((width * 0.85) / contentWidth, (height * 0.85) / contentHeight) * zoom.value;

    camera.scale.set(scale);
    camera.position.set(
        width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale + viewOffset.x,
        height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale + viewOffset.y
    );
}

function destroyView() {
    reframe = undefined;

    observer?.disconnect();
    observer = undefined;

    for (const key of cacheKeys)
        Cache.remove(key);

    cacheKeys.clear();

    interactions?.destroy();
    interactions = undefined;

    if (applicationReady && application)
    {
        application.destroy(true, { children: true });
        applicationReady = false;
    }

    activeCamera = undefined;
}

function onWheel(event: WheelEvent) {
    if (event.deltaY === 0)
        return;

    const bounds = host.value?.getBoundingClientRect();
    if (!bounds)
        return;

    setZoom(
        zoom.value * (event.deltaY < 0 ? 1.2 : 1 / 1.2),
        event.clientX - bounds.left,
        event.clientY - bounds.top
    );
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
    <div class="relative" @wheel.prevent="onWheel">
        <div ref="host" class="h-full w-full"></div>

        <div
            v-if="!loading && !errorMessage"
            class="absolute bottom-3 right-3 flex overflow-hidden rounded-lg border border-line bg-control shadow-lg"
        >
            <button
                type="button"
                aria-label="Zoom out"
                class="px-3 py-2 hover:bg-hover"
                @click="setZoom(zoom / 1.2)"
            >−</button>
            <button
                type="button"
                aria-label="Reset zoom"
                class="border-x border-line px-3 py-2 text-sm hover:bg-hover"
                @click="resetZoom"
            >{{ Math.round(zoom * 100) }}%</button>
            <button
                type="button"
                aria-label="Zoom in"
                class="px-3 py-2 hover:bg-hover"
                @click="setZoom(zoom * 1.2)"
            >+</button>
        </div>

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
