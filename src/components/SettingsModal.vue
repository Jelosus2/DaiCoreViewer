<script setup lang="ts">
import type { EntranceAnimationMode } from "@/stores/settingsStore";
import type { GameLanguage } from "@/types/localization";

import { onBeforeUnmount, onMounted, useTemplateRef, watch } from "vue";

defineProps<{ localizationError?: string }>();

const open = defineModel<boolean>("open", { required: true });
const entranceAnimation = defineModel<EntranceAnimationMode>("entranceAnimation", { required: true });
const gameLanguage = defineModel<GameLanguage>("gameLanguage", { required: true });

const dialog = useTemplateRef<HTMLDialogElement>("dialog");

function syncOpen() {
    const element = dialog.value;
    if (!element)
        return;

    if (open.value && !element.open)
        element.showModal();
    else if (!open.value && element.open)
        element.close();
}

function close() {
    dialog.value?.close();
    open.value = false;
}

function onBackdropClick(event: MouseEvent) {
    const element = dialog.value;
    if (!element || event.target !== element)
        return;

    const rect = element.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
        close();
}

watch(open, syncOpen, { flush: "post" });
onMounted(syncOpen);
onBeforeUnmount(() => dialog.value?.close());
</script>

<template>
    <Teleport to="body">
        <dialog
            ref="dialog"
            aria-labelledby="settings-title"
            class="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-line bg-sidebar p-0 text-white shadow-2xl backdrop:bg-black/60"
            @cancel.prevent="close"
            @close="open = false"
            @click="onBackdropClick"
        >
            <div class="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
                <h2 id="settings-title" class="text-lg font-semibold">
                    Settings
                </h2>
                <button
                    type="button"
                    autofocus
                    class="min-h-11 rounded px-3 py-1.5 text-sm text-muted hover:bg-hover hover:text-white focus-visible:outline-2 focus-visible:outline-focus"
                    @click="close"
                >
                    Close
                </button>
            </div>

            <div class="p-5">
                <label for="game-language" class="block text-sm font-medium">Text language</label>
                <select
                    id="game-language"
                    v-model="gameLanguage"
                    aria-describedby="language-description"
                    class="mt-2 w-full rounded border border-line bg-control px-3 py-2 text-muted focus:border-focus focus:outline-none"
                >
                    <option value="en">English (AI-translated)</option>
                    <option value="zh-Hant">中文 — Original Chinese</option>
                </select>
                <p id="language-description" class="mt-2 text-sm text-subtle">
                    English is an unofficial AI translation and may contain inaccuracies. New or changed text without a matching translation
                    appears in the original Chinese.
                </p>
                <p v-if="localizationError" role="status" class="mt-2 text-sm text-amber-200">{{ localizationError }}</p>
            </div>

            <div class="border-t border-line p-5">
                <label for="entrance-animation" class="block text-sm font-medium">
                    Play entrance animation
                </label>
                <select
                    id="entrance-animation"
                    v-model="entranceAnimation"
                    aria-describedby="entrance-description"
                    class="mt-2 w-full rounded border border-line bg-control px-3 py-2 text-muted focus:border-focus focus:outline-none"
                >
                    <option value="always">Always</option>
                    <option value="daily">Once a day</option>
                    <option value="never">Never</option>
                </select>
                <p id="entrance-description" class="mt-2 text-sm text-subtle">
                    Once a day applies to each skin or asset and resets at midnight in your local time.
                    Changes apply the next time you load an asset.
                </p>
            </div>
        </dialog>
    </Teleport>
</template>
