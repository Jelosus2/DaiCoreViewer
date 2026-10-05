<script setup lang="ts">
import type { IjenAssets } from "@/minigames/ijenAssets";
import type { MinigamePortrait } from "@/minigames/types";

import { createIjenMinigame } from "@/minigames/createIjenMinigame";
import { createIjenUiPainter, layoutIjenUi } from "@/minigames/drawIjenUi";
import { computed, onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from "vue";

const props = defineProps<{
    active: boolean;
    assets: IjenAssets;
    playAction: MinigamePortrait["playAction"];
    isIdle: MinigamePortrait["isIdle"];
}>();

const host = useTemplateRef<HTMLDivElement>("host");
const canvas = useTemplateRef<HTMLCanvasElement>("canvas");
const controller = createIjenMinigame({
    playAction: index => props.playAction(index),
    isIdle: () => props.isIdle()
}, props.assets.ui.arrow);

const view = shallowRef(controller.snapshot());
const viewport = shallowRef({ width: 1920, height: 1080 });
const scale = computed(() => Math.min(viewport.value.width / 1920, viewport.value.height / 1080));
const logicalWidth = computed(() => viewport.value.width / scale.value);
const logicalHeight = computed(() => viewport.value.height / scale.value);
const viewBox = computed(() => `${-logicalWidth.value / 2} ${-logicalHeight.value / 2} ${logicalWidth.value} ${logicalHeight.value}`);
const layout = computed(() => layoutIjenUi(props.assets.ui, view.value, logicalWidth.value, logicalHeight.value));

let painter: ReturnType<typeof createIjenUiPainter> | undefined;
let observer: ResizeObserver | undefined;
let frame = 0;
let lastFrame = 0;

watch(() => props.active, (active) => {
    if (active)
        start();
    else
        stop();
}, { flush: "sync" });

function region(name: "btnHit" | "btnBack") {
    const index = props.assets.ui.bindings[name];
    const pose = layout.value[index], node = props.assets.ui.nodes[index];
    const x = -pose.width * node.pivot[0], y = -pose.height * (1 - node.pivot[1]);
    const [a, b, c, d, e, f] = pose.matrix;

    return [[x, y], [x + pose.width, y], [x + pose.width, y + pose.height], [x, y + pose.height]]
        .map(([x, y]) => `${a*x+c*y+e},${b*x+d*y+f}`).join(" ");
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

function press(button: "hit" | "back", event?: MouseEvent) {
    if (!event || event.button === 0)
    {
        controller.click(button, performance.now());
        syncView();
    }
}

onMounted(() => {
    if (canvas.value)
        painter = createIjenUiPainter(canvas.value, props.assets);

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

    painter?.destroy();
    painter = undefined;
});
</script>

<template>
    <div ref="host" v-show="active && view.visible" class="absolute inset-0 z-10" @wheel.stop.prevent @contextmenu.prevent>
        <canvas ref="canvas" class="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true"></canvas>
        <svg class="absolute inset-0 h-full w-full touch-none" :viewBox="viewBox" aria-label="Ijen Routine Maintenance minigame" @click.stop.prevent>
            <rect :x="-logicalWidth / 2" :y="-logicalHeight / 2" :width="logicalWidth" :height="logicalHeight" fill="transparent" pointer-events="all" />
            <g fill="transparent" pointer-events="all" :class="{ 'cursor-pointer': !view.ending }">
                <polygon :points="region('btnHit')" role="button" tabindex="0" aria-label="Hit when the arrow reaches the upper zone" @click.stop.prevent="press('hit', $event)" @keydown.enter.stop.prevent="press('hit')" @keydown.space.stop.prevent="press('hit')" />
                <polygon :points="region('btnBack')" role="button" tabindex="0" aria-label="Leave minigame" @click.stop.prevent="press('back', $event)" @keydown.enter.stop.prevent="press('back')" @keydown.space.stop.prevent="press('back')" />
            </g>
        </svg>
    </div>
</template>
