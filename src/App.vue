<script setup lang="ts">
import type { SpineManifest, SpineFraming } from "./types/spine";
import type { ViewerCategory } from "./types/viewer.ts";
import { viewerCategories } from "./types/viewer.ts";

import AssetSidebar from "./components/AssetSidebar.vue";
import SpineCanvas from "./components/SpineCanvas.vue";

import { buildSpineCatalog } from "./catalog/buildSpineCatalog.ts";
import { computed, onMounted, onUnmounted, ref, shallowRef } from "vue";

const manifest = shallowRef<SpineManifest | null>(null);
const category = ref<ViewerCategory>("characters");
const framing = ref<SpineFraming>("game");
const selectedItemId = ref<string | null>(null);
const selectedOptionId = ref<string | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const showHotspots = ref(false);
const controller = new AbortController();

const catalog = computed(() => buildSpineCatalog(manifest.value));
const items = computed(() => catalog.value[category.value]);
const selectedItem = computed(() => items.value.find((item) => item.id === selectedItemId.value));
const selectedOption = computed(() => selectedItem.value?.options.find((option) => option.id === selectedOptionId.value));
const categoryLabel = computed(() => viewerCategories.find((item) => item.id === category.value)?.label ?? "Assets");

const root = computed(() =>
    selectedOption.value?.render.status === "ready"
        ? selectedOption.value.render.root ?? null
        : null
);

const unavailableMessage = computed(() => {
    if (!selectedItem.value)
        return `Choose an asset from ${categoryLabel.value}.`;

    const render = selectedOption.value?.render;
    if (!render)
        return "Choose a variant to view.";

    if (render.status === "missing_bundle")
        return "This bundle is missing from the game cache.";

    return render.reason ?? `This asset is unavailable (${render.status.replaceAll("_", " ")}).`;
});

function chooseItem(id: string | null) {
    selectedItemId.value = id;

    const item = items.value.find((entry) => entry.id === id);
    selectedOptionId.value = item?.options.find((option) => option.render.status === "ready")?.id ?? item?.options[0]?.id ?? null;
}

function chooseCategory(next: ViewerCategory) {
    if (category.value === next)
        return;

    category.value = next;
    chooseItem(catalog.value[next][0]?.id ?? null);
}

onMounted(async () => {
    try
    {
        const response = await fetch(`${import.meta.env.BASE_URL}data/spine-manifest.json`, {
            signal: controller.signal
        });

        if (!response.ok)
            throw new Error(`Manifest request failed: ${response.status}`);

        const data = (await response.json()) as SpineManifest;
        if (data.schemaVersion !== 1)
            throw new Error("Unsupported Spine manifest version");

        if (!controller.signal.aborted)
            manifest.value = data;
    }
    catch (error)
    {
        if (!controller.signal.aborted) {
            errorMessage.value = error instanceof Error
                ? error.message
                : String(error);
        }
    }
    finally
    {
        if (!controller.signal.aborted)
            loading.value = false;
    }
});

onUnmounted(() => controller.abort());
</script>

<template>
    <main class="flex min-h-screen flex-col bg-page text-white lg:h-screen lg:flex-row">
        <AssetSidebar
            :catalog="catalog"
            :category="category"
            :selected-id="selectedItemId"
            :loading="loading"
            @category="chooseCategory"
            @select="chooseItem"
        />

        <section class="flex min-h-0 min-w-0 flex-1 flex-col p-5">
            <h1 class="text-2xl font-bold">DaiCoreViewer</h1>
            <p class="mt-1 text-muted">
                {{ selectedItem?.name ?? "Select an asset" }}
            </p>
            <p v-if="selectedItem" class="mt-1 text-sm text-subtle">
                {{ selectedItem.detail }}
            </p>

            <div v-if="selectedItem" class="mt-5 flex flex-wrap items-end gap-4">
                <label
                    v-if="selectedItem.options.length > 1"
                    for="option-select"
                    class="grid gap-1 text-sm text-muted"
                >
                    {{ category === "characters" ? "Skin / model" : "Variant" }}
                    <select
                        id="option-select"
                        v-model="selectedOptionId"
                        class="min-w-64 rounded border border-line bg-control px-3 py-2 focus:border-focus focus:outline-none"
                    >
                        <option
                            v-for="option in selectedItem.options"
                            :key="option.id"
                            :value="option.id"
                        >
                            {{ option.label }}
                        </option>
                    </select>
                </label>

                <p
                    v-if="selectedOption?.render.status === 'ready'"
                    class="pb-2 text-sm text-subtle"
                >
                    {{ selectedOption.render.layerCount }} layer(s)
                </p>

                <label
                    v-if="root && selectedOption?.placement"
                    for="framing-select"
                    class="grid gap-1 text-sm text-muted"
                >
                    View
                    <select
                        id="framing-select"
                        v-model="framing"
                        class="rounded border border-line bg-control px-3 py-2 focus:border-focus focus:outline-none"
                    >
                        <option value="game">Game framing</option>
                        <option value="fit">Fit asset</option>
                    </select>
                </label>

                <label
                    v-if="root && selectedOption?.interaction && selectedOption.render.layerCount === 1"
                    class="flex items-center gap-2 pb-2 text-sm text-muted"
                >
                    <input v-model="showHotspots" type="checkbox" class="accent-focus">
                    Show tap regions
                </label>
            </div>

            <SpineCanvas
                v-if="root"
                :key="`${category}:${selectedItemId}:${selectedOptionId}`"
                :root="root"
                :placement="selectedOption?.placement"
                :framing="framing"
                :interaction="selectedOption?.interaction"
                :show-hotspots="showHotspots"
                class="mt-5 h-[60vh] min-h-80 overflow-hidden rounded-xl border border-line bg-stage lg:min-h-0 lg:flex-1"
            />
            <div
                v-else
                role="status"
                class="mt-5 grid min-h-80 place-items-center rounded-xl border border-line bg-stage p-6 text-center text-muted"
            >
                <p v-if="loading">Loading manifest...</p>
                <p v-else-if="errorMessage" class="text-red-300">
                    {{ errorMessage }}
                </p>
                <p v-else>{{ unavailableMessage }}</p>
            </div>
        </section>
    </main>
</template>
