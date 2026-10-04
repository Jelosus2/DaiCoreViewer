<script setup lang="ts">
import type { MinigamePortrait } from "@/minigames/types";

import { createVodkaMinigame } from "@/minigames/createVodkaMinigame";
import { onMounted, onUnmounted, shallowRef, useId, watch } from "vue";

const props = defineProps<{
    active: boolean;
    sprites: Record<string, string>;
    playAction: MinigamePortrait["playAction"];
    isIdle: MinigamePortrait["isIdle"];
}>();

const controller = createVodkaMinigame({
    isIdle: () => props.isIdle(),
    playAction: (index) => props.playAction(index)
});

const view = shallowRef(controller.snapshot());
const fillClipId = useId();

let frame = 0;
let lastFrame = 0;

watch(() => props.active, (active) => {
    if (active)
        start();
    else
        stop();
}, { flush: "sync" });

function syncView() {
    view.value = controller.snapshot();
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

    syncView();
    lastFrame = performance.now();
    frame = requestAnimationFrame(update);
}

function tap(event: MouseEvent) {
    if (event.button === 0)
        controller.tap(performance.now());
}

onMounted(() => {
    if (props.active)
        start();
});

onUnmounted(stop);
</script>

<template>
    <svg
        v-show="active"
        class="absolute inset-0 z-10 h-full w-full touch-none"
        viewBox="-960 -540 1920 1080"
        preserveAspectRatio="xMidYMid meet"
        aria-label="Vodka Sparkling Spirits minigame"
        @wheel.stop.prevent
        @click.stop.prevent="tap"
    >
        <defs>
            <clipPath :id="fillClipId" clipPathUnits="userSpaceOnUse">
                <rect
                    x="-542.1"
                    :y="-282.8 + 475 * (1 - view.fill)"
                    width="49"
                    :height="475 * view.fill"
                />
            </clipPath>
        </defs>

        <rect
            x="-960"
            y="-540"
            width="1920"
            height="1080"
            fill="transparent"
            pointer-events="all"
            :class="{ 'cursor-pointer': view.canTap }"
        />

        <g
            v-show="view.visible"
            :opacity="view.opacity"
            pointer-events="none"
        >
            <image
                :href="sprites['3']"
                x="-603.5" y="-439.5"
                width="167" height="727"
            />
            <image
                :href="sprites['2']"
                x="-542.1" y="-282.8"
                width="49" height="475"
                :clip-path="`url(#${fillClipId})`"
            />
            <image
                :href="sprites['4']"
                x="-558.1" y="-373.5"
                width="81" height="570"
            />
            <image
                :href="sprites['1']"
                x="-568.6" y="-319.5"
                width="102" height="516"
            />
        </g>
    </svg>
</template>
