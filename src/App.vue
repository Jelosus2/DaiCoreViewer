<script setup lang="ts">
import type { SpineManifest, SpineFraming } from "./types/spine";
import type { ViewerCategory } from "./types/viewer.ts";
import { viewerCategories } from "./types/viewer.ts";

import SettingsModal from "./components/SettingsModal.vue";
import AssetSidebar from "./components/AssetSidebar.vue";
import SpineCanvas from "./components/SpineCanvas.vue";
import SiteNavbar from "./components/SiteNavbar.vue";

import { buildSpineCatalog } from "./spine/buildSpineCatalog.ts";
import { useSettingsStore } from "./stores/settingsStore.ts";
import { computed, onMounted, onUnmounted, ref, watch, shallowRef } from "vue";
import { storeToRefs } from "pinia";

const linkedAsmrContext = shallowRef<AudioContext>();
const manifest = shallowRef<SpineManifest | null>(null);
const catalogSha256 = ref("");
const category = ref<ViewerCategory>("characters");
const framing = ref<SpineFraming>("game");
const selectedItemId = ref<string | null>(null);
const selectedOptionId = ref<string | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const showHotspots = ref(false);
const settingsOpen = ref(false);
const controller = new AbortController();

const settingsStore = useSettingsStore();
const { entranceAnimation } = storeToRefs(settingsStore);

let linkedAsmrId: string | undefined;

watch([category, selectedOptionId], () => {
    if (category.value !== "asmr" || selectedOptionId.value !== linkedAsmrId)
        clearLinkedAsmrContext();
});

const catalog = computed(() => buildSpineCatalog(manifest.value));
const items = computed(() => catalog.value[category.value]);
const selectedItem = computed(() => items.value.find((item) => item.id === selectedItemId.value));
const selectedOption = computed(() => selectedItem.value?.options.find((option) => option.id === selectedOptionId.value));
const audioAssetKey = computed(() => {
    const id = selectedOption.value?.id;
    if (!id)
        return undefined;

    if (category.value === "characters" || category.value === "ungrouped")
        return `model:${id}`;
    if (category.value === "archives")
        return `archive:${id}`;
    if (category.value === "asmr")
        return `asmr:${id}`;

    return undefined;
});

const transitionTargets = computed(() => {
    const option = selectedOption.value;
    if (!option || !manifest.value?.special)
        return [];

    const table = category.value === "archives"
        ? "cfgCfgSpineMultiImageAction.lua"
        : "cfgCfgSpineAction.lua";

    return manifest.value.special.actionTransitions.find((entry) => entry.table === table && entry.id === Number(option.id))?.targets ?? [];
});

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

function clearLinkedAsmrContext() {
    const context = linkedAsmrContext.value;
    linkedAsmrContext.value = undefined;
    linkedAsmrId = undefined;

    if (context && context.state !== "closed")
        void context.close().catch(() => {});
}

function openAsmr(id: number) {
    const target = catalog.value.asmr.find((item) => item.id === String(id));
    const option = target?.options.find((option) => option.render.status === "ready");

    if (!target || !option)
        return;

    clearLinkedAsmrContext();

    const context = new AudioContext();
    void context.resume().catch(() => {});

    linkedAsmrContext.value = context;
    linkedAsmrId = option.id;
    category.value = "asmr";
    selectedItemId.value = target.id;
    selectedOptionId.value = option.id;
}

onMounted(async () => {
    try
    {
        const response = await fetch(`${import.meta.env.BASE_URL}data/spine-manifest.json`, {
            signal: controller.signal
        });

        if (!response.ok)
            throw new Error(`Manifest request failed: ${response.status}`);

        const bytes = await response.arrayBuffer();
        const data = JSON.parse(new TextDecoder().decode(bytes)) as SpineManifest;

        if (crypto.subtle)
        {
            const digest = await crypto.subtle.digest("SHA-256", bytes);
            catalogSha256.value = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
        }

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

onUnmounted(() => {
    controller.abort();
    clearLinkedAsmrContext();
});
</script>

<template>
    <div class="flex min-h-dvh flex-col bg-page text-white lg:h-dvh">
        <SiteNavbar @settings="settingsOpen = true" />

        <main class="flex min-h-0 flex-1 flex-col lg:flex-row">
            <AssetSidebar
                :catalog="catalog"
                :category="category"
                :selected-id="selectedItemId"
                :loading="loading"
                @category="chooseCategory"
                @select="chooseItem"
            />

            <section class="flex min-h-0 min-w-0 flex-1 flex-col p-5">
                <h1 class="text-2xl font-bold">
                    {{ selectedItem?.name ?? "Select an asset" }}
                </h1>
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
                        v-if="root && selectedOption?.interaction"
                        class="flex items-center gap-2 pb-2 text-sm text-muted"
                    >
                        <input v-model="showHotspots" type="checkbox" class="accent-focus">
                        Show tap regions
                    </label>
                </div>

                <SpineCanvas
                    v-if="root"
                    class="mt-5 h-[60vh] min-h-80 overflow-hidden rounded-xl border border-line bg-stage lg:min-h-0 lg:flex-1"
                    :key="`${category}:${selectedItemId}:${selectedOptionId}`"
                    :root="root"
                    :render="selectedOption!.render"
                    :placement="selectedOption?.placement"
                    :framing="framing"
                    :interaction="selectedOption?.interaction"
                    :transition-targets="transitionTargets"
                    :show-hotspots="showHotspots"
                    :asset-key="`${category}:${selectedItemId}:${selectedOptionId}`"
                    :audio-asset-key="audioAssetKey"
                    :catalog-sha256="catalogSha256"
                    :audio-context="linkedAsmrContext"
                    :foreground="!settingsOpen"
                    @asmr="openAsmr"
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

        <SettingsModal
            v-model:open="settingsOpen"
            :entrance-animation="entranceAnimation"
            @update:entrance-animation="settingsStore.setEntranceAnimation"
        />
    </div>
</template>
