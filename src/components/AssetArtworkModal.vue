<script setup lang="ts">
import type { ViewerArtwork } from "@/types/viewer";

import { onBeforeUnmount, onMounted, ref, useId, useTemplateRef, watch } from "vue";

const artwork = defineModel<ViewerArtwork | null>("artwork", { required: true });
const dialog = useTemplateRef<HTMLDialogElement>("dialog");
const titleId = useId();
const loading = ref(true);
const failed = ref(false);
const baseUrl = import.meta.env.BASE_URL;

watch(artwork, syncArtwork, { flush: "post" });

function close() {
    dialog.value?.close();
    artwork.value = null;
}

function syncArtwork() {
    const element = dialog.value;
    if (!element)
        return;

    if (artwork.value)
    {
        loading.value = true;
        failed.value = false;

        if (!element.open)
            element.showModal();
    }
    else if (element.open)
    {
        element.close();
    }
}

onMounted(syncArtwork);
onBeforeUnmount(() => dialog.value?.close());
</script>

<template>
    <Teleport to="body">
        <dialog
            ref="dialog"
            :aria-labelledby="titleId"
            class="artwork-dialog fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-0 bg-transparent text-white backdrop:bg-black/85"
            @cancel.prevent="close"
            @close="artwork = null"
            @click.self="close"
        >
            <div v-if="artwork" class="flex h-full min-h-0 flex-col gap-3" @click.self="close">
                <header class="flex shrink-0 items-center justify-between gap-3">
                    <h2 :id="titleId" class="min-w-0 text-sm font-medium sm:text-base">
                        {{ artwork.title }}
                    </h2>
                    <button
                        type="button"
                        autofocus
                        aria-label="Close artwork"
                        class="min-h-11 shrink-0 rounded-lg bg-control px-4 text-sm hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
                        @click="close"
                    >Close</button>
                </header>
                <div class="relative flex min-h-0 flex-1 items-center justify-center" @click.self="close">
                    <p v-if="failed" role="status" class="text-center text-muted">
                        Image unavailable. Close this window and try again.
                    </p>
                    <template v-else>
                        <p v-if="loading" role="status" class="absolute text-muted">
                            Loading image...
                        </p>
                        <img
                            :key="artwork.src"
                            :src="`${baseUrl}${artwork.src}`"
                            :alt="artwork.title"
                            decoding="async"
                            class="max-h-full max-w-full object-contain"
                            @load="loading = false"
                            @error="loading = false; failed = true"
                        >
                    </template>
                </div>
            </div>
        </dialog>
    </Teleport>
</template>
