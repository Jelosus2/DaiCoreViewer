<script setup lang="ts">
import type { SpineManifest } from "./types/spine";
import type { ViewerCategory, AssetPreviews, ViewerArtwork } from "./types/viewer.ts";
import { viewerCategories } from "./types/viewer.ts";

import AssetArtworkModal from "./components/AssetArtworkModal.vue";
import SettingsModal from "./components/SettingsModal.vue";
import SupportModal from "./components/SupportModal.vue";
import AssetSidebar from "./components/AssetSidebar.vue";
import AssetPicker from "./components/AssetPicker.vue";
import SpineCanvas from "./components/SpineCanvas.vue";
import SiteNavbar from "./components/SiteNavbar.vue";
import SiteFooter from "./components/SiteFooter.vue";

import { buildSpineCatalog } from "./spine/buildSpineCatalog.ts";
import { useSettingsStore } from "./stores/settingsStore.ts";
import { useLocalizationStore } from "./stores/localizationStore";
import { sha256Hex } from "./utils/sha256";
import { computed, onMounted, onUnmounted, ref, watch, shallowRef } from "vue";
import { storeToRefs } from "pinia";

const linkedAsmrContext = shallowRef<AudioContext>();
const manifest = shallowRef<SpineManifest | null>(null);
const previews = shallowRef<AssetPreviews>();
const artwork = shallowRef<ViewerArtwork | null>(null);
const catalogSha256 = ref("");
const category = ref<ViewerCategory>("characters");
const selectedItemId = ref<string | null>(null);
const selectedOptionId = ref<string | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const settingsOpen = ref(false);
const supportOpen = ref(false);
const assetsOpen = ref(false);
const controller = new AbortController();

const settingsStore = useSettingsStore();
const localizationStore = useLocalizationStore();
const { entranceAnimation } = storeToRefs(settingsStore);

let linkedAsmrId: string | undefined;

watch([category, selectedOptionId], () => {
    if (category.value !== "asmr" || selectedOptionId.value !== linkedAsmrId)
        clearLinkedAsmrContext();
});

const catalog = computed(() => buildSpineCatalog(manifest.value, previews.value, localizationStore.text));
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

async function loadPreviews() {
    try
    {
        const response = await fetch(`${import.meta.env.BASE_URL}assets/spine/previews/asset-previews.json`, {
            signal: controller.signal
        });

        if (!response.ok)
            throw new Error(`Preview request failed: ${response.status}`);

        const data = await response.json() as AssetPreviews;
        if (data.schemaVersion !== 1 || data.catalogSha256 !== catalogSha256.value)
            throw new Error("Previews and Spine catalogs do not match; regenerate previews");

        if (!controller.signal.aborted)
            previews.value = data;
    }
    catch (error)
    {
        if (!controller.signal.aborted)
            console.warn("Asset previews unavailable:", error);
    }
}

function chooseItem(id: string | null) {
    selectedItemId.value = id;

    const item = items.value.find((entry) => entry.id === id);
    selectedOptionId.value = item?.options.find((option) => option.render.status === "ready")?.id ?? item?.options[0]?.id ?? null;
}

function chooseCategory(next: ViewerCategory) {
    if (category.value === next)
        return;

    category.value = next;
    chooseItem(null);
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

        catalogSha256.value = await sha256Hex(bytes);

        if (data.schemaVersion !== 1)
            throw new Error("Unsupported Spine manifest version");

        if (!controller.signal.aborted)
        {
            manifest.value = data;
            await localizationStore.load(catalogSha256.value, controller.signal);
            void loadPreviews();
        }
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
    <div class="app-shell flex h-dvh min-h-0 flex-col overflow-hidden bg-page text-white">
        <SiteNavbar
            :assets-open="assetsOpen"
            @assets="assetsOpen = true"
            @settings="settingsOpen = true"
        />

        <main class="flex min-h-0 flex-1">
            <AssetSidebar
                class="hidden lg:flex"
                :catalog="catalog"
                :category="category"
                :selected-id="selectedItemId"
                :loading="loading"
                @category="chooseCategory"
                @select="chooseItem"
                @artwork="artwork = $event"
            />

            <section class="flex min-h-0 min-w-0 flex-1 flex-col p-3 lg:p-5">
                <div class="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between lg:flex-col lg:items-stretch lg:gap-0">
                    <div class="min-w-0">
                        <h1 class="truncate text-xl font-bold lg:text-2xl">
                            {{ selectedItem?.name ?? "Select an asset" }}
                        </h1>
                        <p v-if="selectedItem" class="mt-1 hidden text-sm text-subtle lg:block">
                            {{ selectedItem.detail }}
                        </p>
                    </div>
                </div>

                <SpineCanvas
                    v-if="root"
                    class="mt-3 min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-stage lg:mt-5"
                    :key="`${category}:${selectedItemId}:${selectedOptionId}`"
                    :root="root"
                    :render="selectedOption!.render"
                    :placement="selectedOption?.placement"
                    :interaction="selectedOption?.interaction"
                    :transition-targets="transitionTargets"
                    :asset-key="`${category}:${selectedItemId}:${selectedOptionId}`"
                    :audio-asset-key="audioAssetKey"
                    :catalog-sha256="catalogSha256"
                    :audio-context="linkedAsmrContext"
                    :foreground="!settingsOpen && !assetsOpen && !artwork && !supportOpen"
                    @asmr="openAsmr"
                />
                <div
                    v-else
                    role="status"
                    class="mt-3 grid min-h-0 flex-1 place-items-center rounded-xl border border-line bg-stage p-6 text-center text-muted lg:mt-5"
                >
                    <p v-if="loading">Loading manifest...</p>
                    <p v-else-if="errorMessage" class="text-red-300">
                        {{ errorMessage }}
                    </p>
                    <div v-else>
                        <p>{{ unavailableMessage }}</p>
                        <button
                            v-if="!selectedItem"
                            type="button"
                            class="mt-4 min-h-11 rounded-lg bg-selected px-4 py-2 text-white focus-visible:outline-2 focus-visible:outline-focus lg:hidden"
                            @click="assetsOpen = true"
                        >Browse assets</button>
                    </div>
                </div>
            </section>
        </main>

        <SiteFooter />

        <AssetPicker
            v-model:open="assetsOpen"
            :catalog="catalog"
            :category="category"
            :selected-id="selectedItemId"
            :loading="loading"
            @category="chooseCategory"
            @select="chooseItem"
            @artwork="artwork = $event"
        />

        <AssetArtworkModal v-model:artwork="artwork" />

        <SettingsModal
            v-model:game-language="settingsStore.gameLanguage"
            :localization-error="localizationStore.error"
            v-model:open="settingsOpen"
            :entrance-animation="entranceAnimation"
            @update:entrance-animation="settingsStore.setEntranceAnimation"
        />

        <SupportModal
            v-model:open="supportOpen"
            :ready="!loading && !errorMessage && !settingsOpen && !assetsOpen && !artwork"
        />
    </div>
</template>
