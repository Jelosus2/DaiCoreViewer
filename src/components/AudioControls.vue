<script setup lang="ts">
import SpeakerIcon from "./icons/SpeakerIcon.vue";
import CaptionsIcon from "./icons/CaptionsIcon.vue";

import { nextTick, onMounted, onUnmounted, ref, useId, useTemplateRef } from "vue";

defineProps<{
    blocked: boolean;
}>();

const emit = defineEmits<{
    unlock: [];
}>();

const volume = defineModel<number>("volume", { required: true });
const captions = defineModel<boolean>("captions", { required: true });

const controls = useTemplateRef<HTMLDivElement>("controls");
const volumeButton = useTemplateRef<HTMLButtonElement>("volumeButton");
const slider = useTemplateRef<HTMLInputElement>("slider");
const volumeOpen = ref(false);
const panelId = useId();
const sliderId = useId();

async function toggleVolume() {
    emit("unlock");
    volumeOpen.value = !volumeOpen.value;

    if (volumeOpen.value)
    {
        await nextTick();
        slider.value?.focus();
    }
}

function updateVolume(event: Event) {
    const input = event.target as HTMLInputElement;
    volume.value = input.valueAsNumber / 100;

    emit("unlock");
}

function onOutsidePointerDown(event: PointerEvent) {
    if (event.target instanceof Node && !controls.value?.contains(event.target))
        volumeOpen.value = false;
}

function onFocusOut(event: FocusEvent) {
    if (!(event.relatedTarget instanceof Node) || !controls.value?.contains(event.relatedTarget))
        volumeOpen.value = false;
}

function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape" || !volumeOpen.value)
        return;

    event.preventDefault();
    event.stopPropagation();

    volumeOpen.value = false;
    volumeButton.value?.focus();
}

onMounted(() => {
    document.addEventListener("pointerdown", onOutsidePointerDown, true);
});

onUnmounted(() => {
    document.removeEventListener("pointerdown", onOutsidePointerDown, true);
});
</script>

<template>
    <div
        ref="controls"
        data-audio-controls
        role="group"
        aria-label="Audio controls"
        class="absolute left-3 top-3 z-20"
        @pointerdown.stop="emit('unlock')"
        @wheel.stop
        @focusout="onFocusOut"
        @keydown="onKeyDown"
    >
        <div class="flex overflow-hidden rounded-lg border border-line bg-control shadow-lg">
            <button
                ref="volumeButton"
                type="button"
                aria-label="Volume"
                :aria-expanded="volumeOpen"
                :aria-controls="panelId"
                :title="volume === 0 ? 'Muted. Adjust volume' : blocked ? 'Enable sound and adjust volume' : 'Adjust volume'"
                :data-state="volume === 0 ? 'muted' : 'audible'"
                class="grid size-10 place-items-center border-r border-line text-muted hover:bg-hover hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                @click="toggleVolume"
            >
                <SpeakerIcon :muted="volume === 0" class="size-5" aria-hidden="true" focusable="false" />
            </button>
            <button
                type="button"
                aria-label="Captions"
                :aria-pressed="captions"
                :title="captions ? 'Turn captions off' : 'Turn captions on'"
                :class="captions ? 'bg-selected text-white' : 'text-muted'"
                class="grid size-10 place-items-center hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                @click="captions = !captions"
            >
                <CaptionsIcon :enabled="captions" class="size-5" aria-hidden="true" focusable="false" />
            </button>
        </div>

        <div
            v-if="volumeOpen"
            :id="panelId"
            class="absolute left-0 top-full mt-2 w-56 max-w-[calc(100vw-4rem)] rounded-lg border border-line bg-control p-3 shadow-lg"
        >
            <label :for="sliderId" class="flex items-center justify-between gap-3 text-sm text-muted">
                Volume
                <span>{{ Math.round(volume * 100) }}%</span>
            </label>
            <input
                :id="sliderId"
                ref="slider"
                type="range"
                min="0"
                max="100"
                step="1"
                :value="Math.round(volume * 100)"
                :aria-valuetext="`${Math.round(volume * 100)}%`"
                class="mt-2 block w-full accent-focus focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                @input="updateVolume"
            >
        </div>
    </div>
</template>
