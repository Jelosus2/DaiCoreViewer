<script setup lang="ts">
import type { MelodyUi, MelodyImages } from "@/minigames/melodyAssets";
import type { MinigamePortrait } from "@/minigames/types";

import { createMelodyMinigame } from "@/minigames/createMelodyMinigame";
import { createMelodyUiPainter } from "@/minigames/drawMelodyUi";
import { onMounted, onUnmounted, shallowRef, watch } from "vue";

const props = defineProps<{
    active: boolean;
    ui: MelodyUi;
    images: MelodyImages;
    playAction: MinigamePortrait["playAction"];
    isIdle: MinigamePortrait["isIdle"];
    setMotion: (mode: "idle" | "in" | "out", seconds?: number) => void;
}>();

const canvas = shallowRef<HTMLCanvasElement>();
const controller = createMelodyMinigame({
    playAction: (index, complete) => props.playAction(index, complete),
    isIdle: () => props.isIdle()
});

const view = shallowRef(controller.snapshot());
const choices = [
    { index: 2, x: -285.1, label: "Scissors" },
    { index: 1, x: 5, label: "Rock" },
    { index: 3, x: 284.9, label: "Paper" }
];

let painter: ReturnType<typeof createMelodyUiPainter> | undefined;
let observer: ResizeObserver | undefined;
let frame = 0;
let lastFrame = 0;
let previousPhase = view.value.phase;
let outAge = 0;

watch(() => props.active, (active) => {
    if (active)
        start();
    else
        stop();
}, { flush: "sync" });

function syncView() {
    view.value = controller.snapshot();
    painter?.draw(view.value);
}

function stop() {
    cancelAnimationFrame(frame);
    frame = 0;

    controller.stop();
    syncView();
    props.setMotion("idle");
}

function update(now: number) {
    frame = 0;

    if (!props.active)
        return;

    const seconds = (now - lastFrame) / 1000;
    lastFrame = now;

    controller.advance(seconds);
    syncView();

    if (view.value.phase === "reveal")
    {
        props.setMotion("in", view.value.age);
    }
    else
    {
        if (previousPhase === "reveal")
            outAge = 0;

        outAge += seconds;
        props.setMotion("out", outAge);
    }

    previousPhase = view.value.phase;

    if (controller.isRunning())
        frame = requestAnimationFrame(update);
}

function start() {
    stop();
    controller.start();
    syncView();

    previousPhase = "choose";
    outAge = Infinity;
    lastFrame = performance.now();
    frame = requestAnimationFrame(update);
}

function choose(index: number) {
    controller.choose(index);
    syncView();
}

function exit() {
    controller.exit();
    syncView();
}

onMounted(() => {
    painter = createMelodyUiPainter(canvas.value!, props.ui, props.images);
    observer = new ResizeObserver(() => painter?.draw(view.value));
    observer.observe(canvas.value!);

    if (props.active)
        start();
});

onUnmounted(() => {
    observer?.disconnect();
    stop();

    painter?.destroy();
    painter = undefined;
});
</script>

<template>
    <div
        v-show="active"
        class="absolute inset-0 z-10 touch-none"
        @wheel.stop.prevent
        @click.stop.prevent
    >
        <canvas
            ref="canvas"
            class="absolute inset-0 h-full w-full"
            aria-hidden="true"
        />

        <svg
            class="absolute inset-0 h-full w-full"
            viewBox="-960 -540 1920 1080"
            preserveAspectRatio="xMidYMid meet"
            aria-label="Melody Examination Game"
        >
            <rect
                x="-960" y="-540"
                width="1920" height="1080"
                fill="transparent"
            />

            <g v-if="view.phase === 'choose'">
                <g
                    v-for="choice in choices"
                    :key="choice.index"
                    role="button"
                    tabindex="0"
                    :aria-label="choice.label"
                    :aria-disabled="!view.canChoose"
                    :class="{ 'cursor-pointer': view.canChoose }"
                    @click.stop="choose(choice.index)"
                    @keydown.enter.stop.prevent="choose(choice.index)"
                    @keydown.space.stop.prevent="choose(choice.index)"
                >
                    <rect
                        :x="choice.x - 125"
                        y="195.8"
                        width="250" height="250"
                        fill="transparent"
                    />
                </g>

                <g
                    role="button"
                    tabindex="0"
                    aria-label="Exit minigame"
                    class="cursor-pointer"
                    @click.stop="exit"
                    @keydown.enter.stop.prevent="exit"
                    @keydown.space.stop.prevent="exit"
                >
                    <rect
                        x="-913.7" y="-518.4"
                        width="216" height="100"
                        fill="transparent"
                    />
                </g>
            </g>
        </svg>
    </div>
</template>
