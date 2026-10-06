<script setup lang="ts">
import type { MinigamePortrait } from "@/minigames/types";

import { createPoseidonMinigame } from "@/minigames/poseidon/createPoseidonMinigame";
import { computed, onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from "vue";

const props = defineProps<{
    active: boolean;
    image: HTMLImageElement;
    playAction: MinigamePortrait["playAction"];
    isIdle: MinigamePortrait["isIdle"];
    getStagedAction: MinigamePortrait["getStagedAction"];
}>();

const host = useTemplateRef<HTMLDivElement>("host");
const canvas = useTemplateRef<HTMLCanvasElement>("canvas");
const controller = createPoseidonMinigame({
    playAction: (index) => props.playAction(index),
    isIdle: () => props.isIdle(),
    getStagedAction: (index) => props.getStagedAction(index)
});

const view = shallowRef(controller.snapshot());
const viewport = shallowRef({ width: 1920, height: 1080 });
const scale = computed(() => Math.min(viewport.value.width / 1920, viewport.value.height / 1080));
const logicalWidth = computed(() => viewport.value.width / scale.value);
const logicalHeight = computed(() => viewport.value.height / scale.value);
const viewBox = computed(() => `${-logicalWidth.value / 2} ${-logicalHeight.value / 2} ${logicalWidth.value} ${logicalHeight.value}`);

let frame = 0;
let lastFrame = 0;
let observer: ResizeObserver | undefined;

watch(() => props.active, (active) => {
    if (active)
        start();
    else
        stop();
}, { flush: "sync" });

function paint() {
    const element = canvas.value;
    const context = element?.getContext("2d");

    if (!element || !context)
        return;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, element.width, element.height);

    if (!props.active || !view.value.backVisible)
        return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const unit = ratio * scale.value;

    context.setTransform(unit, 0, 0, unit, viewport.value.width * ratio / 2, viewport.value.height * ratio / 2);
    context.drawImage(props.image, -logicalWidth.value / 2 + 46.30078125, -logicalHeight.value / 2 + 31.599609375, 216, 80);
}

function resize() {
    if (!host.value || !canvas.value)
        return;

    const { width, height } = host.value.getBoundingClientRect();
    viewport.value = { width: Math.max(1, width), height: Math.max(1, height) };

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.value.width = Math.max(1, Math.round(viewport.value.width * ratio));
    canvas.value.height = Math.max(1, Math.round(viewport.value.height * ratio));

    paint();
}

function syncView() {
    view.value = controller.snapshot();
    paint();
}

function stop() {
    cancelAnimationFrame(frame);
    frame = 0;

    controller.stop();
    syncView();
}

function update(now: number) {
    frame = 0;

    if (!props.active)
        return;

    controller.advance((now - lastFrame) / 1000);

    lastFrame = now;
    syncView();

    if (controller.isRunning())
        frame = requestAnimationFrame(update);
}

function start() {
    stop();
    controller.start();
    resize();
    syncView();

    lastFrame = performance.now();
    frame = requestAnimationFrame(update);
}

function click(button: Parameters<typeof controller.click>[0], event: MouseEvent) {
    if (event.button === 0)
    {
        controller.click(button, performance.now());
        syncView();
    }
}

onMounted(() => {
    observer = new ResizeObserver(resize);
    if (host.value)
        observer.observe(host.value);

    if (props.active)
        start();
});

onUnmounted(() => {
    observer?.disconnect();
    observer = undefined;

    stop();
});
</script>

<template>
    <div ref="host" v-show="active" class="absolute inset-0 z-10" @wheel.stop.prevent @contextmenu.prevent>
        <canvas ref="canvas" class="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true"></canvas>
        <svg class="absolute inset-0 h-full w-full touch-none" :viewBox="viewBox" aria-label="Poseidon Curiosities for Sale minigame" @click.stop.prevent>
            <rect :x="-logicalWidth / 2" :y="-logicalHeight / 2" :width="logicalWidth" :height="logicalHeight" fill="transparent" pointer-events="all" />
            <g :class="{ 'cursor-pointer': !view.closing }" fill="transparent" pointer-events="all">
                <rect x="-818" y="195" width="100" height="100" role="button" aria-label="Left selector" @click.stop.prevent="click('left', $event)" />
                <rect x="-672.0999755859375" y="195" width="100" height="100" role="button" aria-label="Right selector" @click.stop.prevent="click('right', $event)" />
                <rect x="-817.9965057373047" y="301.19250106811523" width="435.2959899902344" height="65.61499786376953" role="button" aria-label="Confirm selection" @click.stop.prevent="click('confirm', $event)" />
                <rect v-show="view.backVisible" :x="-logicalWidth / 2 + 46.30078125" :y="-logicalHeight / 2 + 21.599609375" width="216" height="100" role="button" aria-label="Leave minigame" @click.stop.prevent="click('back', $event)" />
            </g>
        </svg>
    </div>
</template>
