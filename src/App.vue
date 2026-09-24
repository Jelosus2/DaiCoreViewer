<script setup lang="ts">
import type { SpineManifest, SpineCharacter, SpineModel } from "@/types/spine";

import CharacterSidebar from "./components/CharacterSidebar.vue";
import SpineCanvas from "./components/SpineCanvas.vue";

import { computed, onMounted, onUnmounted, ref, shallowRef } from "vue";

const manifest = shallowRef<SpineManifest | null>(null);
const selectedCharacterId = ref<string | null>(null);
const selectedModelId = ref<string | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const controller = new AbortController();

const characters = computed<SpineManifest["characters"]>(() => manifest.value?.characters ?? {});
const selectedCharacter = computed<SpineCharacter | undefined>(() =>
    selectedCharacterId.value
        ? characters.value[selectedCharacterId.value]
        : undefined
);

const models = computed<SpineModel[]>(() =>
    selectedCharacter.value
        ? Object.values(selectedCharacter.value.skins).sort((a, b) => a.modelId - b.modelId)
        : []
);

const selectedModel = computed<SpineModel | undefined>(() =>
    selectedModelId.value
        ? selectedCharacter.value?.skins[selectedModelId.value]
        : undefined
);

const characterName = computed(() =>
    selectedCharacter.value?.names.english ??
    selectedCharacter.value?.names.alias ??
    selectedCharacter.value?.names.local ??
    "Select a character"
);

const root = computed(() =>
    selectedModel.value?.render.status === "ready"
        ? selectedModel.value.render.root ?? null
        : null
);

const unavailableMessage = computed(() => {
    const model = selectedModel.value;

    if (!model)
        return "Choose a model to view.";
    if (model.render.status === "missing_bundle")
        return "This model's bundle is missing from the game cache.";
    if (model.render.status === "ready")
        return "This model has no prefab root in the manifest.";

    return `This model is unavailable (${model.render.status.replaceAll("_", " ")}).`
});

function chooseCharacter(id: string) {
    const character = characters.value[id];
    if (!character)
        return;

    selectedCharacterId.value = id;

    const entries = Object.entries(character.skins);
    selectedModelId.value = (entries.find(([, model]) => model.render.status === "ready") ?? entries[0])?.[0] ?? null;
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
        <CharacterSidebar
            :characters="characters"
            :selected-id="selectedCharacterId"
            :loading="loading"
            @select="chooseCharacter"
        />

        <section class="flex min-h-0 min-w-0 flex-1 flex-col p-5">
            <h1 class="text-2xl font-bold">DaiCoreViewer</h1>
            <p class="mt-1 text-muted">{{ characterName }}</p>

            <div v-if="selectedCharacter" class="mt-5 flex flex-wrap items-end gap-4">
                <label for="model-select" class="grid gap-1 text-sm text-muted">
                    Skin / model
                    <select
                        id="model-select"
                        v-model="selectedModelId"
                        class="min-w-64 rounded border border-line bg-control px-3 py-2 focus:border-focus focus:outline-none"
                    >
                        <option
                            v-for="model in models"
                            :key="model.modelId"
                            :value="String(model.modelId)"
                        >
                            {{ model.modelId }} · {{ model.render.l2dName }}
                        </option>
                    </select>
                </label>
                <p v-if="selectedModel?.render.status === 'ready'" class="pb-2 text-sm text-subtle">
                    {{ selectedModel.render.layerCount }} layer(s)
                </p>
            </div>

            <SpineCanvas
                v-if="root"
                :key="selectedCharacterId + ':' + selectedModelId"
                :root="root"
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
