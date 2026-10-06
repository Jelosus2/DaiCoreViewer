<script setup lang="ts">
import type { LycorisButton } from "@/minigames/createLycorisMinigame";
import type { LycorisAssets } from "@/minigames/lycorisAssets";
import type { MinigamePortrait } from "@/minigames/types";

import { createLycorisMinigame } from "@/minigames/createLycorisMinigame";
import { createLycorisUiPainter, layoutLycorisUi } from "@/minigames/drawLycorisUi";
import { computed, onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from "vue";

const props = defineProps<{
    active: boolean;
    assets: LycorisAssets;
    playAction: MinigamePortrait["playAction"];
}>();

const host = useTemplateRef<HTMLDivElement>("host");
const canvas = useTemplateRef<HTMLCanvasElement>("canvas");
const controller = createLycorisMinigame({
    playAction: (index, onComplete) => props.playAction(index, onComplete)
});

const view = shallowRef(controller.snapshot());
const viewport = shallowRef({ width: 1920, height: 1080 });
const scale = computed(() => Math.min(viewport.value.width / 1920, viewport.value.height / 1080));
const logicalWidth = computed(() => viewport.value.width / scale.value);
const logicalHeight = computed(() => viewport.value.height / scale.value);
const viewBox = computed(() => `${-logicalWidth.value / 2} ${-logicalHeight.value / 2} ${logicalWidth.value} ${logicalHeight.value}`);
const layout = computed(() => layoutLycorisUi(props.assets.ui, view.value, logicalWidth.value, logicalHeight.value));

let painter: ReturnType<typeof createLycorisUiPainter> | undefined;
let observer: ResizeObserver | undefined;
let frame = 0;
let lastFrame = 0;

watch(() => props.active, (active) => {
    if (active)
        start();
    else
        stop();
}, { flush: "sync" });

function region(name: "btnL" | "btnR" | "btnBack") {
    const index = props.assets.ui.bindings[name];
    const pose = layout.value[index], node = props.assets.ui.nodes[index];
    const x = -pose.width * node.pivot[0], y = -pose.height * (1 - node.pivot[1]);
    const [a, b, c, d, e, f] = pose.matrix;

    return [[x, y], [x + pose.width, y], [x + pose.width, y + pose.height], [x, y + pose.height]]
        .map(([x, y]) => `${a*x+c*y+e},${b*x+d*y+f}`).join(" ");
}

function label(name: "btnL" | "btnR") {
    const index = props.assets.ui.bindings[name];
    const pose = layout.value[index], node = props.assets.ui.nodes[index];

    return {
        transform: `matrix(${pose.matrix.join(" ")})`,
        x: pose.width * (0.5 - node.pivot[0]),
        y: pose.height * (node.pivot[1] - 0.5),
        opacity: pose.active ? pose.alpha : 0
    };
}

function keydown(event: KeyboardEvent) {
    if (
        !props.active || !view.value.ready || view.value.ending || view.value.feverRemaining !== null ||
        event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey
    )
    {
        return;
    }

    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"))
        return;

    const key = event.key.toLowerCase();
    if (key !== "a" && key !== "d")
        return;

    event.preventDefault();
    press(key === "a" ? "left" : "right");
}

function syncView() {
    view.value = controller.snapshot();
    painter?.draw(view.value);
}

function resize() {
    if (!host.value)
        return;

    const { width, height } = host.value.getBoundingClientRect();

    viewport.value = { width: Math.max(1, width), height: Math.max(1, height) };
    painter?.draw(view.value);
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

function press(button: LycorisButton, event?: MouseEvent) {
    if (!event || event.button === 0)
    {
        controller.click(button, performance.now());
        syncView();
    }
}

onMounted(() => {
    window.addEventListener("keydown", keydown);

    if (canvas.value)
        painter = createLycorisUiPainter(canvas.value, props.assets);

    observer = new ResizeObserver(resize);
    if (host.value)
        observer.observe(host.value);

    if (props.active)
        start();
});

onUnmounted(() => {
    window.removeEventListener("keydown", keydown);

    observer?.disconnect();
    observer = undefined;

    stop();

    painter?.destroy();
    painter = undefined;
});
</script>

<template>
    <div ref="host" v-show="active && view.visible" class="absolute inset-0 z-10" @wheel.stop.prevent @contextmenu.prevent>
        <canvas ref="canvas" class="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true"></canvas>
        <svg class="absolute inset-0 h-full w-full touch-none" :viewBox="viewBox" aria-label="Lycoris Quiet Life in the Manor minigame" @click.stop.prevent>
            <rect :x="-logicalWidth / 2" :y="-logicalHeight / 2" :width="logicalWidth" :height="logicalHeight" fill="transparent" pointer-events="all" />
            <g v-if="view.ready && view.feverRemaining === null" fill="transparent" pointer-events="all" :class="{ 'cursor-pointer': !view.ending }">
                <polygon :points="region('btnL')" role="button" tabindex="0" aria-label="Play left lane (A)" aria-keyshortcuts="a" @click.stop.prevent="press('left', $event)" @keydown.enter.stop.prevent="press('left')" @keydown.space.stop.prevent="press('left')" />
                <polygon :points="region('btnR')" role="button" tabindex="0" aria-label="Play right lane (D)" aria-keyshortcuts="d" @click.stop.prevent="press('right', $event)" @keydown.enter.stop.prevent="press('right')" @keydown.space.stop.prevent="press('right')" />
                <polygon :points="region('btnBack')" role="button" tabindex="0" aria-label="Leave minigame" @click.stop.prevent="press('back', $event)" @keydown.enter.stop.prevent="press('back')" @keydown.space.stop.prevent="press('back')" />
            </g>
            <rect v-else :x="-logicalWidth / 2" :y="-logicalHeight / 2" :width="logicalWidth" :height="logicalHeight" fill="transparent" pointer-events="all" role="button" tabindex="0" aria-label="Play fever" @click.stop.prevent="press('fever', $event)" @keydown.enter.stop.prevent="press('fever')" @keydown.space.stop.prevent="press('fever')" />
            <g v-if="view.ready && view.feverRemaining === null && !view.ending" fill="#453346" font-family="system-ui, sans-serif" font-size="42" font-weight="700" text-anchor="middle" dominant-baseline="central" pointer-events="none" aria-hidden="true">
                <text v-bind="label('btnL')">A</text>
                <text v-bind="label('btnR')">D</text>
            </g>
        </svg>
    </div>
</template>
