<script setup lang="ts">
import type { AsmrState } from "@/types/audio";

import FullscreenIcon from "./icons/FullscreenIcon.vue";
import PlaybackIcon from "./icons/PlaybackIcon.vue";

defineProps<{
    state: AsmrState;
    fullscreen: boolean;
    fullscreenSupported: boolean;
}>();

const emit = defineEmits<{
    toggle: [];
    seek: [time: number];
    fullscreen: [];
}>();

function formatTime(time: number) {
    const seconds = Math.floor(time);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function seek(event: Event) {
    emit("seek", (event.target as HTMLInputElement).valueAsNumber);
}
</script>

<template>
    <div
        data-audio-controls
        role="group"
        aria-label="ASMR playback"
        class="asmr-chrome absolute bottom-4 left-1/2 z-20 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-white shadow-lg backdrop-blur-md"
        @pointerdown.stop
        @wheel.stop
    >
        <div class="flex items-center gap-3">
            <button
                type="button"
                :disabled="!state.ready"
                :aria-label="state.ended ? 'Replay ASMR' : state.paused || state.blocked ? 'Play ASMR' : 'Pause ASMR'"
                :title="state.ended ? 'Replay' : state.paused || state.blocked ? 'Play' : 'Pause'"
                class="grid size-11 shrink-0 lg:size-9 place-items-center rounded-full hover:bg-white/10 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-white"
                @click="emit('toggle')"
            >
                <PlaybackIcon
                    :state="state.ended ? 'replay' : state.paused || state.blocked ? 'play' : 'pause'"
                    class="size-5"
                    aria-hidden="true"
                    focusable="false"
                />
            </button>

            <span class="flex-1 text-xs tabular-nums text-white/75">
                {{ formatTime(state.time) }}
                <span class="text-white/40">/ {{ formatTime(state.duration) }}</span>
            </span>

            <button
                v-if="fullscreenSupported"
                type="button"
                :aria-label="fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
                :title="fullscreen ? 'Exit fullscreen' : 'Fullscreen'"
                class="grid size-11 shrink-0 lg:size-9 place-items-center rounded-full text-white/75 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
                @click="emit('fullscreen')"
            >
                <FullscreenIcon :fullscreen="fullscreen" class="size-5" aria-hidden="true" focusable="false" />
            </button>
        </div>

        <input
            v-if="state.paused"
            type="range"
            aria-label="ASMR position"
            :aria-valuetext="`${formatTime(state.time)} of ${formatTime(state.duration)}`"
            min="0"
            :max="state.duration"
            step="1"
            :value="state.time"
            :disabled="!state.ready"
            class="asmr-seek mt-1 block w-full focus-visible:outline-2 focus-visible:outline-white"
            @input="seek"
        >
    </div>
</template>

<style scoped>
.asmr-seek {
    appearance: none;
    height: 20px;
    background: transparent;
    cursor: pointer;
}

.asmr-seek::-webkit-slider-runnable-track {
    height: 3px;
    border-radius: 999px;
    background: rgb(255 255 255 / 25%);
}

.asmr-seek::-webkit-slider-thumb {
    appearance: none;
    width: 11px;
    height: 11px;
    margin-top: -4px;
    border-radius: 50%;
    background: white;
}

.asmr-seek::-moz-range-track {
    height: 3px;
    border-radius: 999px;
    background: rgb(255 255 255 / 25%);
}

.asmr-seek::-moz-range-thumb {
    width: 11px;
    height: 11px;
    border: 0;
    border-radius: 50%;
    background: white;
}
</style>
