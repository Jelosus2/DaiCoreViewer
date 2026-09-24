<script setup lang="ts">
import type { SpineManifest } from "@/types/spine";
import SpineCanvas from "@/components/SpineCanvas.vue";

import { computed, onMounted, onUnmounted, ref, shallowRef } from "vue";

const manifest = shallowRef<SpineManifest | null>(null);
const selectedModelId = ref("1001003");
const loading = ref(true);
const errorMessage = ref("");
const controller = new AbortController();

const render = computed(() =>
    manifest.value?.characters["10010"]?.skins?.[selectedModelId.value]?.render
);

const root = computed(() =>
    render.value?.status === "ready" ? render.value.root ?? null : null
);

onMounted(async () => {
    try {
        const response = await fetch(
            `${import.meta.env.BASE_URL}data/spine-manifest.json`,
            { signal: controller.signal }
        );

        if (!response.ok)
            throw new Error(`Manifest request failed: ${response.status}`);

        const data = (await response.json()) as SpineManifest;
        if (data.schemaVersion !== 1)
            throw new Error("Unsupported Spine manifest version");

        if (!controller.signal.aborted)
            manifest.value = data;
    } catch (error) {
        if (!controller.signal.aborted) {
            errorMessage.value = error instanceof Error
                ? error.message
                : String(error);
        }
    } finally {
        if (!controller.signal.aborted)
            loading.value = false;
    }
});

onUnmounted(() => controller.abort());
</script>

<template>
    <main class="min-h-screen bg-slate-950 p-6 text-white">
        <h1 class="text-3xl font-bold">DaiCoreViewer</h1>

        <label class="mt-5 flex items-center gap-3 text-slate-200">
            Alps model
            <select
                v-model="selectedModelId"
                class="rounded border border-slate-600 bg-slate-900 px-3 py-2"
            >
                <option value="1001003">1001003 — one skeleton</option>
                <option value="1001002">1001002 — three layers</option>
            </select>
        </label>

        <SpineCanvas
            v-if="root"
            :key="selectedModelId"
            :root="root"
            class="mt-6 h-[70vh] min-h-96 overflow-hidden rounded-xl border border-slate-700"
        />
        <p v-else-if="loading" class="mt-6">Loading manifest...</p>
        <p v-else role="alert" class="mt-6 text-red-300">
            {{ errorMessage || "This model has no ready prefab root." }}
        </p>
    </main>
</template>
