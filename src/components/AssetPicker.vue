<script setup lang="ts">
import type { SpineCatalog, ViewerCategory, ViewerArtwork } from "@/types/viewer";

import AssetSidebar from "./AssetSidebar.vue";

import { onBeforeUnmount, onMounted, useId, useTemplateRef, watch } from "vue";

defineProps<{
    catalog: SpineCatalog;
    category: ViewerCategory;
    selectedId: string | null;
    loading: boolean;
}>();

const emit = defineEmits<{
    category: [category: ViewerCategory];
    select: [id: string];
    artwork: [artwork: ViewerArtwork];
}>();

const open = defineModel<boolean>("open", { required: true });
const dialog = useTemplateRef<HTMLDialogElement>("dialog");
const titleId = useId();
const desktop = window.matchMedia("(min-width: 64rem)");

function close() {
    dialog.value?.close();
    open.value = false;
}

function syncOpen() {
    const element = dialog.value;
    if (!element)
        return;

    if (desktop.matches)
    {
        close();
        return;
    }

    if (open.value && !element.open)
        element.showModal();
    else if (!open.value && element.open)
        element.close();
}

function select(id: string) {
    emit("select", id);
    close();
}

watch(open, syncOpen, { flush: "post" });

onMounted(() => {
    desktop.addEventListener("change", syncOpen);
    syncOpen();
});

onBeforeUnmount(() => {
    desktop.removeEventListener("change", syncOpen);
    dialog.value?.close();
});
</script>

<template>
    <Teleport to="body">
        <dialog
            id="asset-picker"
            ref="dialog"
            :aria-labelledby="titleId"
            class="asset-picker m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-0 bg-sidebar text-white lg:hidden"
            @cancel.prevent="close"
            @close="open = false"
        >
            <div class="flex h-full min-h-0 flex-col">
                <div class="flex shrink-0 items-center justify-between border-b border-line px-4 py-2">
                    <h2 :id="titleId" class="text-lg font-semibold">Assets</h2>
                    <button
                        type="button"
                        autofocus
                        class="min-h-11 rounded-lg px-3 py-2 text-sm text-muted hover:bg-hover hover:text-white focus-visible:outline-2 focus-visible:outline-focus"
                        @click="close"
                    >Close</button>
                </div>

                <AssetSidebar
                    picker
                    :catalog="catalog"
                    :category="category"
                    :selected-id="selectedId"
                    :loading="loading"
                    class="flex-1"
                    @category="emit('category', $event)"
                    @select="select"
                    @artwork="emit('artwork', $event)"
                />
            </div>
        </dialog>
    </Teleport>
</template>
