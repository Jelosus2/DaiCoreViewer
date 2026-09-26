<script setup lang="ts">
import type { SpineRoot, SpinePlacement, SpineFraming, SpineActionConfig, SpineActionItem } from "@/types/spine";

import { Spine, SetupPoseBoundsProvider } from "@esotericsoftware/spine-pixi-v8";
import { Application, Assets, Cache, Container, Graphics, Rectangle, UPDATE_PRIORITY } from "pixi.js";
import { onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";

type TrackEntry = ReturnType<Spine["state"]["setAnimation"]>;

interface StagedTap {
    entry: TrackEntry;
    animationName: string;
    duration: number;
    points: number[];
    step: number;
    targetTime: number;
}

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
const hotspotOutlines: Graphics[] = [];
const viewOffset = { x: 0, y: 0 };

let disposed = false;
let application: Application | undefined;
let applicationReady = false;
let assetsReady = false;
let observer: ResizeObserver | undefined;
let reframe: (() => void) | undefined;
let activeCamera: Container | undefined;
let stopStageUpdates: (() => void) | undefined;
let nextTapAt = 0;

watch([() => props.framing, () => props.placement], resetZoom);

watch(() => props.showHotspots, (show) => {
    for (const outline of hotspotOutlines)
        outline.visible = show;
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

        const spines = buildScene(artLayer);
        if (spines.length === 1 && props.interaction)
            addHotspots(hotspotLayer, spines[0]!, props.interaction);

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

function isCentered(point?: [number, number]) {
    return !point || (Math.abs(point[0] - 0.5) < 0.001 && Math.abs(point[1] - 0.5) < 0.001);
}

function buildScene(stageParent: Container) {
    const containers: Container[] = [];
    const instances: Spine[] = [];
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

function hasTapArea(item: SpineActionItem): boolean {
    const area = item.areas?.[0];

    return item.gesture === 0 &&
        (item.role ?? 1) === 1 &&
        !!item.sName &&
        item.sName !== "in" &&
        !!area &&
        area.every(Number.isFinite) &&
        area[2] > 0 &&
        area[3] > 0;
}

function isSimpleTap(item: SpineActionItem): boolean {
    return hasTapArea(item) &&
        (item.sType === 2 || item.sType === 6) &&
        item.content === undefined &&
        (item.sType !== 6 || (Number.isInteger(item.index) && item.index > 0));
}

function stagedTapPoints(item: SpineActionItem): number[] | undefined {
    const content = item.content;

    if (
        !hasTapArea(item) ||
        item.sType !== 7 ||
        !Number.isInteger(item.index) ||
        item.index <= 1 ||
        !content ||
        Object.keys(content).length !== 1
    )
    {
        return;
    }

    const raw = content.clicks;
    if (!Array.isArray(raw) || raw.length === 0)
        return;

    const points: number[] = [];
    let previous = 0;

    for (const [index, value] of raw.entries())
    {
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)
            return;

        if (value === 0)
        {
            // A zero target means reverse to the start; it must be the final step.
            if (index !== raw.length - 1 || index === 0)
                return;
        }
        else if (value <= previous)
        {
            return;
        }

        points.push(value);
        previous = value;
    }

    return points;
}

function addHotspots(layer: Container, spine: Spine, interaction: SpineActionConfig) {
    const stages = new Map<number, StagedTap>();
    let tracking = false;

    function stopTracking() {
        if (!tracking)
            return;

        spine.ticker.remove(updateStages);
        tracking = false;
    }

    function updateStages() {
        for (const [trackIndex, stage] of stages)
        {
            if (spine.state.getCurrent(trackIndex) !== stage.entry)
            {
                stages.delete(trackIndex);
                continue;
            }

            const reached = stage.entry.timeScale > 0
                ? stage.entry.trackTime >= stage.targetTime
                : stage.entry.timeScale < 0 && stage.entry.trackTime <= stage.targetTime;

            if (!reached)
                continue;

            if (stage.step === stage.points.length - 1)
            {
                stage.entry.trackTime = 0;
                spine.state.clearTrack(trackIndex);
                spine.skeleton.setToSetupPose();
                stages.delete(trackIndex);
            }
            else
            {
                stage.entry.trackTime = stage.targetTime;
                stage.entry.timeScale = 0;
            }
        }

        if (stages.size === 0)
            stopTracking();
    }

    function playStaged(item: SpineActionItem, animationName: string, duration: number, points: number[]) {
        const trackIndex = item.index;
        let stage = stages.get(trackIndex);

        if (stage && spine.state.getCurrent(trackIndex) !== stage.entry)
        {
            stages.delete(trackIndex);
            stage = undefined;
        }

        if (stage)
        {
            if (stage.animationName !== animationName || stage.entry.timeScale !== 0)
                return;

            const step = stage.step + 1;
            if (step >= stage.points.length)
                return;

            stage.step = step;
            stage.targetTime = stage.points[step] * stage.duration;
            stage.entry.timeScale = stage.points[step] === 0 ? -1 : 1;
            return;
        }

        const entry = spine.state.setAnimation(trackIndex, animationName, false);
        entry.timeScale = 1;

        stages.set(trackIndex, {
            entry,
            animationName,
            duration,
            points,
            step: 0,
            targetTime: points[0] * duration
        });

        if (!tracking)
        {
            spine.ticker.add(updateStages, undefined, UPDATE_PRIORITY.LOW);
            tracking = true;
        }
    }

    stopStageUpdates = () => {
        stopTracking();
        stages.clear();
    };

    for (const item of interaction.items)
    {
        const points = stagedTapPoints(item);
        if (!isSimpleTap(item) && !points)
            continue;

        const animationName = item.sName;
        const area = item.areas?.[0];

        if (!animationName || !area)
            continue;

        const animation = spine.skeleton.data.findAnimation(animationName);
        if (!animation || (points && animation.duration <= 0))
            continue;

        const [x, y, width, height, angle] = area;
        const hitbox = new Container();

        hitbox.position.set(x, -y);
        hitbox.rotation = -angle * Math.PI / 180;
        hitbox.hitArea = new Rectangle(-width / 2, -height / 2, width, height);
        hitbox.eventMode = "static";
        hitbox.cursor = "pointer";

        const outline = new Graphics()
            .rect(-width / 2, -height / 2, width, height)
            .stroke({ color: 0xc7aa83, width: 2 });

        outline.eventMode = "none";
        outline.visible = props.showHotspots;

        hotspotOutlines.push(outline);
        hitbox.addChild(outline);

        hitbox.on("pointertap", () => {
            const now = performance.now();
            if (disposed || now < nextTapAt)
                return;

            if (!points && item.sType === 2 && spine.state.getCurrent(1))
                return;

            nextTapAt = now + 500;

            if (points)
            {
                playStaged(item, animationName, animation.duration, points);
            }
            else if (item.sType === 2)
            {
                spine.state.setEmptyAnimation(1, 0);
                const entry = spine.state.addAnimation(1, animationName, false, 0);
                entry.mixDuration = 0.2;
                spine.state.addEmptyAnimation(1, 0.5, 0);
            }
            else
            {
                spine.state.setAnimation(item.index, animationName, false);
            }
        });

        layer.addChild(hitbox);
    }
}

function destroyView() {
    reframe = undefined;

    observer?.disconnect();
    observer = undefined;

    for (const key of cacheKeys)
        Cache.remove(key);

    cacheKeys.clear();

    stopStageUpdates?.();
    stopStageUpdates = undefined;

    if (applicationReady && application)
    {
        application.destroy(true, { children: true });
        applicationReady = false;
    }

    hotspotOutlines.length = 0;
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
