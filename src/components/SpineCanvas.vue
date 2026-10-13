<script setup lang="ts">
import type { SpineRoot, SpinePlacement, SpineActionConfig, SpineActionTarget, SpineRender } from "@/types/spine";
import type { AsmrState } from "@/types/audio.ts";

import AudioControls from "./AudioControls.vue";
import AsmrControls from "./AsmrControls.vue";
import FullscreenIcon from "./icons/FullscreenIcon.vue";
import InteractionMarkersIcon from "./icons/InteractionMarkersIcon.vue";

import { createAssetAudioSession } from "@/audio/createAssetAudioSession";
import { createSpineTransitionSession } from "@/spine/createSpineTransitionSession";
import { acquireEntranceEffects, entranceTextureUrls } from "@/spine/playSpineEntrance.ts";
import { useMinigameSession } from "@/minigames/useMinigameSession";
import { useSettingsStore } from "@/stores/settingsStore.ts";
import { useCanvasPan } from "@/composables/useCanvasPan";
import { Application, Assets, Cache, Container, Texture } from "pixi.js";
import { onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";
import "pixi.js/prepare";

const props = defineProps<{
    root: SpineRoot;
    render: SpineRender;
    placement?: SpinePlacement;
    interaction?: SpineActionConfig;
    transitionTargets?: SpineActionTarget[];
    assetKey: string;
    audioAssetKey?: string;
    catalogSha256: string;
    audioContext?: AudioContext;
    foreground: boolean;
}>();

const emit = defineEmits<{
    asmr: [id: number];
}>();

const stage = useTemplateRef<HTMLDivElement>("stage");
const host = useTemplateRef<HTMLDivElement>("host");
const loading = ref(true);
const errorMessage = ref("");
const loadingMessage = ref("Loading Spine assets...");
const audioMessage = ref("");
const audioBlocked = ref(false);
const caption = ref("");
const zoom = ref(1);
const asmrState = ref<AsmrState>();
const asmrControlsVisible = ref(true);
const fullscreen = ref(false);
const fullscreenSupported = document.fullscreenEnabled;
const fullscreenMessage = ref("");

const settingsStore = useSettingsStore();

const cacheKeys = new Set<string>();
const loadedAssets = new Set<string>();
const loadedPages = new Set<string>();
const pendingLoads = new Set<Promise<void>>();
const viewOffset = { x: 0, y: 0 };
const isAsmr = props.audioAssetKey?.startsWith("asmr:") ?? false;

let disposed = false;
let application: Application | undefined;
let applicationReady = false;
let observer: ResizeObserver | undefined;
let reframe: (() => void) | undefined;
let activeCamera: Container | undefined;
let session: ReturnType<typeof createSpineTransitionSession> | undefined;
let activeArtLayer: Container | undefined;
let entranceAssets: ReturnType<typeof acquireEntranceEffects> | undefined;
let asmr: ReturnType<ReturnType<typeof createAssetAudioSession>["startAsmr"]> | undefined;
let canvasTap: { x: number; y: number } | undefined;
let hideAsmrControls: ReturnType<typeof setTimeout> | undefined;
let hotspotPointer = false;

const updateAsmr = () => asmr?.update();
const updateTouch = () => audio.updateTouch(
    props.foreground &&
    !loading.value &&
    !errorMessage.value &&
    !minigameOpen.value &&
    document.visibilityState === "visible"
);

const minigame = useMinigameSession({
    render: props.render,
    interaction: props.interaction,
    audio: {
        playEffect: (bank, cue) => audio.playEffect(bank, cue),
        playButton: (name, cooldownMs, key) => audio.playButton(name, cooldownMs, key),
        playVoice: (id) => audio.playVoice(id),
        playMusic: (bank, cue) => audio.playMusic(bank, cue),
        stopMusic: () => audio.stopMusic()
    },
    loadTexture: (url) => loadTrackedAsset<Texture>(url),
    playAction: playMinigameAction,
    isIdle: isMinigameIdle,
    onOpenChange: (open) => {
        if (open)
        {
            audio.resetButtons();
            resetZoom();
        }
        else
        {
            reframe?.();
        }
    },
    getSceneNode: (path) => session?.getSceneNode(path),
    getStagedAction: (index) => session?.getStagedAction(index)
});

const minigameOverlay = minigame.overlay;
const minigameOpen = minigame.open;

const {
    panMode,
    panning,
    togglePanMode,
    stopPan,
    onPanPointerDown,
    onPanLostPointerCapture,
    onPanAuxClick
} = useCanvasPan({
    host,
    canPan: () => !loading.value && !errorMessage.value && !minigameOpen.value && activeCamera !== undefined,
    move: (deltaX, deltaY) => {
        viewOffset.x += deltaX;
        viewOffset.y += deltaY;

        activeCamera?.position.set(activeCamera.position.x + deltaX, activeCamera.position.y + deltaY);
    }
});

const audio = createAssetAudioSession({
    assetKey: props.audioAssetKey,
    context: props.audioContext,
    catalogSha256: props.catalogSha256,
    baseUrl: import.meta.env.BASE_URL,
    volume: () => settingsStore.audioVolume,
    captions: () => settingsStore.audioCaptions,
    onProgress: (completed, total) => {
        loadingMessage.value = total > 0
            ? `Loading audio files... ${completed}/${total}`
            : "Loading audio files...";
    },
    onCaption: (text) => { caption.value = text; },
    onBlocked: (blocked) => { audioBlocked.value = blocked; }
});

watch(() => props.placement, resetZoom);

watch([
    () => settingsStore.interactionMarkers,
    () => panMode.value,
    () => minigameOpen.value,
    () => loading.value
], () => {
    session?.setMarkersVisible(settingsStore.interactionMarkers && !panMode.value && !minigameOpen.value && !loading.value);
});

watch(() => [settingsStore.audioVolume, settingsStore.audioCaptions], () => {
    audio.refreshSettings();
}, { flush: "sync" });

watch([
    () => asmrState.value?.paused,
    () => asmrState.value?.blocked,
    () => asmrState.value?.ready,
    () => asmrState.value?.ended,
    () => panMode.value
], revealAsmrControls);

async function loadRoot(root: SpineRoot) {
    const spines = root.nodes.flatMap((node) => node.spines);
    const images = root.nodes.flatMap((node) => [node.image, node.mask].filter((url): url is string => Boolean(url)));
    const urls = [...new Set([...spines.flatMap((spine) => [spine.json, spine.atlas]), ...images])];

    for (const spine of spines)
    {
        for (const page of spine.pages)
        {
            loadedPages.add(page);
        }
    }

    await Promise.all(urls.map((url) => loadTrackedAsset(url)));
}

async function releaseAssets() {
    await Promise.allSettled([...pendingLoads]);

    const urls = [...loadedAssets];
    const pages = [...loadedPages];

    loadedAssets.clear();
    loadedPages.clear();

    const assets = await Promise.allSettled(urls.map((url) => Assets.unload(url)));
    const pageAssets = await Promise.allSettled(pages.map((page) => Assets.loader.unload(page)));

    for (const result of [...assets, ...pageAssets])
    {
        if (result.status === "rejected")
            console.error("Failed to unload a Spine asset:", result.reason);
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

        await loadRoot(props.root);

        if (disposed)
        {
            await releaseAssets()
            return;
        }

        entranceAssets = acquireEntranceEffects();
        const entranceEffects = await entranceAssets.ready;

        if (disposed || !entranceEffects)
        {
            await releaseAssets();
            return;
        }

        await app.renderer.prepare?.upload(entranceTextureUrls(entranceEffects).map((url) => Assets.get<Texture>(url)));

        if (disposed)
        {
            await releaseAssets();
            return;
        }

        const camera = new Container();
        const portrait = new Container();
        const entranceWrapper = new Container();
        const entranceLayer = new Container();
        entranceLayer.eventMode = "none";

        const artLayer = new Container();
        const hotspotLayer = new Container();
        const overlayLayer = new Container();
        overlayLayer.eventMode = "none";

        activeArtLayer = artLayer;

        app.stage.addChild(camera);
        camera.addChild(entranceWrapper, overlayLayer);
        entranceWrapper.addChild(portrait, entranceLayer);
        portrait.addChild(artLayer, hotspotLayer);

        await minigame.prepare({
            camera,
            uploadTextures: async (textures) => await app.renderer.prepare?.upload(textures)
        });

        if (disposed)
        {
            await releaseAssets();
            return;
        }

        session = createSpineTransitionSession({
            initialRender: props.render,
            interaction: props.interaction,
            targets: props.transitionTargets ?? [],
            artLayer,
            hotspotLayer,
            overlayLayer,
            ticker: app.ticker,
            cacheKeys,
            showMarkers: false,
            loadRoot,
            onSceneChanged: () => reframe?.(),
            onError: (error) => {
                errorMessage.value = error instanceof Error ? error.message : String(error);
            },
            onActionStart: audio.playAction,
            onSpineUIChange: minigame.supported
                ? minigame.setOpen
                : undefined,
            onAsmr: (id) => emit("asmr", id),
            onHotspotPointer: () => {
                hotspotPointer = true;
            },
            getGamePortraitScale: () => props.placement?.[2] ?? 1,
            shouldPlayEntrance: () => !isAsmr && settingsStore.claimEntranceAnimation(props.assetKey),
            entranceEffects,
            entranceWrapper,
            entranceLayer,
            entranceSkipTarget: app.canvas
        });
        await session.preloadTransitions();

        if (disposed)
        {
            await releaseAssets();
            return;
        }

        if (props.audioAssetKey)
        {
            loadingMessage.value = "Loading audio files...";

            try
            {
                await audio.prepare();
            }
            catch (error)
            {
                audio.destroy();

                if (!disposed)
                {
                    audioMessage.value = "Audio unavailable. Reload this asset to try again.";
                    console.error("Failed to prepare audio:", error);
                }
            }
        }

        if (disposed)
            return;

        session.mountInitial();

        if (isAsmr && !audioMessage.value)
        {
            try
            {
                asmr = audio.startAsmr(
                    session.createAsmrSync,
                    (state) => {
                        asmrState.value = state;
                    },
                    (error) => {
                        audioMessage.value = "ASMR unavailable. Reload this asset to try again.";
                        console.error(error);
                    }
                );

                app.ticker.add(updateAsmr);
            }
            catch (error)
            {
                audioMessage.value = error instanceof Error ? error.message : String(error);
            }
        }

        activeCamera = camera;

        const resize = () => {
            if (disposed)
                return;

            frame(element, app, camera, portrait, artLayer, minigame.getPlacement(props.placement));
        };

        reframe = resize;
        resize();

        observer = new ResizeObserver(resize);
        observer.observe(element);

        loading.value = false;

        app.ticker.add(updateTouch);
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

async function toggleFullscreen() {
    const root = stage.value;
    if (!root)
        return;

    try
    {
        if (document.fullscreenElement === root)
            await document.exitFullscreen();
        else
            await root.requestFullscreen();
    }
    catch
    {
        fullscreenMessage.value = "Fullscreen is unavailable in this browser.";
    }
}

function loadTrackedAsset<T>(url: string): Promise<T> {
    const request = Assets.load<T>(url).then((asset) => {
        loadedAssets.add(url);
        return asset;
    });

    const settled = request.then(() => {}, () => {});

    pendingLoads.add(settled);
    void settled.then(() => pendingLoads.delete(settled));

    return request;
}

function resetZoom() {
    stopPan();

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
    placement: SpinePlacement | undefined
) {
    const width = Math.max(1, element.clientWidth);
    const height = Math.max(1, element.clientHeight);
    app.renderer.resize(width, height);

    portrait.position.set(0, 0);
    portrait.scale.set(1);

    if (placement)
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

function playMinigameAction(index: number, onComplete?: () => void): boolean {
    return session?.triggerByIndex(index, onComplete) ?? false;
}

function isMinigameIdle(): boolean {
    return session?.isIdle() ?? false;
}

function destroyView() {
    application?.ticker?.remove(updateAsmr);
    application?.ticker?.remove(updateTouch);
    audio.destroy();

    asmr = undefined;

    stopPan();
    minigame.destroy();

    reframe = undefined;

    observer?.disconnect();
    observer = undefined;

    session?.destroy();
    session = undefined;

    entranceAssets?.release();
    entranceAssets = undefined;

    activeArtLayer?.destroy({ children: true });
    activeArtLayer = undefined;

    for (const key of cacheKeys)
        Cache.remove(key);

    cacheKeys.clear();

    if (applicationReady && application)
    {
        application.destroy(true, { children: true });
        applicationReady = false;
    }

    activeCamera = undefined;
}

function onPointerDown(event: PointerEvent) {
    revealAsmrControls();

    if (event.target instanceof Element && event.target.closest("[data-audio-controls], [data-canvas-controls]"))
        return;

    if (!loading.value && !isAsmr)
        void audio.unlock();

    hotspotPointer = false;

    if (
        !loading.value && !errorMessage.value && !minigameOpen.value &&
        event.isPrimary && event.button === 0 && !panMode.value &&
        event.target instanceof HTMLCanvasElement &&
        event.target.parentElement === host.value
    )
    {
        canvasTap = { x: event.clientX, y: event.clientY };
    }
    else
    {
        canvasTap = undefined;
    }

    onPanPointerDown(event);
}

function toggleAsmr() {
    asmr?.toggle();
    void audio.unlock();
}

function onCanvasClick(event: MouseEvent) {
    const tap = canvasTap;
    canvasTap = undefined;

    if (!tap || !(event.target instanceof HTMLCanvasElement) || panMode.value || Math.hypot(event.clientX - tap.x, event.clientY - tap.y) >= 6)
        return;

    if (isAsmr)
        toggleAsmr();
    else if (!hotspotPointer)
        audio.playTouch();
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

function revealAsmrControls() {
    if (!isAsmr || disposed)
        return;

    clearTimeout(hideAsmrControls);
    asmrControlsVisible.value = true;

    const state = asmrState.value;
    if (!state?.ready || state.paused || state.blocked || state.ended || panMode.value)
        return;

    hideAsmrControls = setTimeout(() => {
        const root = stage.value;
        const focused = document.activeElement;

        if (root?.querySelector("[data-audio-controls]:hover") || root?.contains(focused) && focused?.matches(":focus-visible"))
            return;

        asmrControlsVisible.value = false;
    }, 2500);
}

function onFullscreenChange() {
    fullscreen.value = document.fullscreenElement === stage.value;
    fullscreenMessage.value = "";

    revealAsmrControls();
}

onMounted(() => {
    document.addEventListener("fullscreenchange", onFullscreenChange);
    void setup();
});

onUnmounted(() => {
    disposed = true;

    clearTimeout(hideAsmrControls);
    document.removeEventListener("fullscreenchange", onFullscreenChange);
    destroyView();
    void releaseAssets().catch(console.error);
});
</script>

<template>
    <div
        ref="stage"
        class="canvas-stage relative"
        :class="{
            'asmr-stage': isAsmr,
            'asmr-quiet': isAsmr && !asmrControlsVisible
        }"
        @wheel.prevent="onWheel"
        @pointerdown.capture="onPointerDown"
        @auxclick.capture="onPanAuxClick"
        @lostpointercapture="onPanLostPointerCapture"
        @pointermove="revealAsmrControls"
        @pointerleave="revealAsmrControls"
        @focusin="revealAsmrControls"
        @focusout="revealAsmrControls"
    >
        <div
            ref="host"
            class="h-full w-full"
            :class="{
                'pan-enabled': panMode,
                'is-panning': panning
            }"
            @click="onCanvasClick"
        ></div>

        <div
            v-if="!loading && !errorMessage"
            :class="isAsmr ? 'asmr-chrome right-3 top-3 border-white/10 bg-black/30 backdrop-blur-md' : 'bottom-3 right-3 border-line bg-control'"
            class="absolute flex overflow-hidden rounded-lg border shadow-lg"
        >
            <button
                type="button"
                aria-label="Pan view"
                :aria-pressed="panMode"
                :disabled="minigameOpen"
                title="Turn Pan on to drag the view with one finger or the left mouse button."
                :class="panMode ? 'bg-selected text-white' : ''"
                class="border-r border-line px-3 py-2 text-sm hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
                @click="togglePanMode"
            >Pan</button>
            <button
                type="button"
                aria-label="Zoom out"
                class="px-3 py-2 hover:bg-hover"
                @click="setZoom(zoom / 1.2)"
            >−</button>
            <button
                type="button"
                aria-label="Reset zoom and position"
                title="Click to reset zoom and position. Drag with the middle mouse button to pan outside minigames."
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

        <div
            v-if="!isAsmr && !loading && !errorMessage"
            data-canvas-controls
            class="absolute right-3 top-3 z-30 flex gap-2"
            @pointerdown.stop
            @wheel.stop
        >
            <button
                v-if="interaction && !minigameOpen"
                type="button"
                aria-label="Interaction hints"
                :aria-pressed="settingsStore.interactionMarkers"
                :title="settingsStore.interactionMarkers
                    ? 'Hide interaction hints'
                    : 'Show interaction hints. Circles: tap; arrows: swipe or drag; disc: ASMR; play: minigame.'"
                :class="settingsStore.interactionMarkers ? 'bg-selected text-white' : 'bg-control text-muted'"
                class="grid size-10 place-items-center rounded-lg border border-line shadow-lg hover:bg-hover hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                @click="settingsStore.interactionMarkers = !settingsStore.interactionMarkers"
            >
                <InteractionMarkersIcon class="size-5" aria-hidden="true" focusable="false" />
            </button>
            <button
                v-if="fullscreenSupported"
                type="button"
                :aria-label="fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
                :title="fullscreen ? 'Exit fullscreen' : 'Fullscreen'"
                class="grid size-10 place-items-center rounded-lg border border-line bg-control text-muted shadow-lg hover:bg-hover hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                @click="toggleFullscreen"
            >
                <FullscreenIcon :fullscreen="fullscreen" class="size-5" aria-hidden="true" focusable="false" />
            </button>
        </div>

        <AudioControls
            v-if="props.audioAssetKey && !loading && !errorMessage && !audioMessage"
            :class="{ 'asmr-chrome': isAsmr }"
            v-model:volume="settingsStore.audioVolume"
            v-model:captions="settingsStore.audioCaptions"
            :blocked="audioBlocked"
            :immersive="isAsmr"
            @unlock="audio.unlock"
        />
        <AsmrControls
            v-if="asmrState && !loading && !errorMessage && !audioMessage"
            :state="asmrState"
            :fullscreen="fullscreen"
            :fullscreen-supported="fullscreenSupported"
            @toggle="toggleAsmr"
            @seek="asmr?.seek"
            @fullscreen="toggleFullscreen"
        />

        <p
            v-if="fullscreenMessage"
            role="status"
            class="pointer-events-none absolute inset-x-4 top-16 z-30 text-center text-sm text-white"
        >{{ fullscreenMessage }}</p>
        <p
            v-if="audioMessage && !loading && !errorMessage"
            role="status"
            class="absolute left-3 top-3 rounded bg-control px-3 py-2 text-sm text-muted"
        >{{ audioMessage }}</p>
        <p
            v-if="caption && !loading && !errorMessage"
            :class="isAsmr
                ? ['asmr-caption w-max max-w-[90%] bg-black/25 px-3 py-1.5 text-base leading-relaxed', asmrControlsVisible ? asmrState?.paused ? 'bottom-28' : 'bottom-20' : 'bottom-8']
                : 'bottom-16 w-[90%] bg-black/70 px-4 py-2 text-sm'"
            class="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 rounded-lg text-center text-white"
        >{{ caption }}</p>

        <p
            v-if="loading"
            role="status"
            aria-live="polite"
            class="absolute inset-0 grid place-items-center text-muted"
        >
            {{ loadingMessage }}
        </p>
        <p
            v-else-if="errorMessage"
            role="alert"
            class="absolute inset-0 grid place-items-center p-6 text-red-300"
        >
            {{ errorMessage }}
        </p>

        <component
            v-if="minigameOverlay"
            :is="minigameOverlay.component"
            v-bind="minigameOverlay.props"
            :active="minigameOpen && !loading && !errorMessage"
        />
    </div>
</template>

<style scoped>
.pan-enabled,
.pan-enabled :deep(canvas) {
    cursor: grab !important;
    touch-action: none;
    user-select: none;
}

.is-panning,
.is-panning :deep(canvas) {
    cursor: grabbing !important;
}

.canvas-stage:fullscreen {
    width: 100vw;
    height: 100dvh;
    min-height: 0;
    margin: 0;
    border: 0;
    border-radius: 0;
    background: black;
}

.canvas-stage::backdrop {
    background: black;
}

.asmr-stage .asmr-chrome {
    transition: opacity 200ms ease;
}

.asmr-quiet .asmr-chrome {
    opacity: 0;
    pointer-events: none;
}

.asmr-quiet :deep(canvas) {
    cursor: none;
}

.asmr-caption {
    max-width: min(90%, 42rem);
    text-shadow: 0 1px 4px black;
    transition: bottom 200ms ease;
}

@media (prefers-reduced-motion: reduce) {
    .asmr-stage .asmr-chrome,
    .asmr-caption {
        transition: none;
    }
}
</style>
