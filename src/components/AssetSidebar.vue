<script setup lang="ts">
import type { SpineCatalog, ViewerCategory, ViewerArtwork } from "@/types/viewer";
import { viewerCategories } from "@/types/viewer";

import AssetThumbnail from "./AssetThumbnail.vue";

import { computed, ref, watch, useId } from "vue";

const props = defineProps<{
    catalog: SpineCatalog;
    category: ViewerCategory;
    selectedId: string | null;
    loading: boolean;
    picker?: boolean;
}>();

const emit = defineEmits<{
    category: [category: ViewerCategory];
    select: [id: string];
    artwork: [artwork: ViewerArtwork];
}>();

const query = ref("");
const searchId = useId();
const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

const categoryLabel = computed(() => viewerCategories.find((item) => item.id === props.category)?.label ?? "Assets");
const filteredItems = computed(() => {
    const search = query.value.trim().toLocaleLowerCase();

    return props.catalog[props.category]
        .filter((item) => item.searchText.includes(search))
        .sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.id, b.id));
});

watch(() => props.category, () => {
    query.value = "";
});
</script>

<template>
    <aside
        class="min-h-0 shrink-0 flex-col bg-sidebar"
        :class="picker ? 'flex h-full w-full' : 'w-80 border-r border-line'"
    >
        <div class="border-b border-line p-4">
            <h2 v-if="!picker" class="font-semibold">Assets</h2>

            <div
                class="grid grid-cols-2 gap-1"
                :class="{ 'mt-3': !picker }"
                aria-label="Asset categories"
            >
                <button
                    v-for="tab in viewerCategories"
                    :key="tab.id"
                    type="button"
                    :aria-pressed="category === tab.id"
                    :class="category === tab.id
                        ? 'bg-selected text-white'
                        : 'text-muted hover:bg-hover'"
                    class="min-h-11 rounded px-2 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-focus"
                    @click="emit('category', tab.id)"
                >
                    {{ tab.label }}
                    <span class="text-xs opacity-75">{{ catalog[tab.id].length }}</span>
                </button>
            </div>

            <label :for="searchId" class="mt-4 block text-sm text-muted">
                Search {{ categoryLabel }}
            </label>
            <input
                :id="searchId"
                v-model="query"
                type="search"
                placeholder="Name or ID"
                class="mt-1 w-full rounded border border-line bg-control px-3 py-2 text-white focus:border-focus focus:outline-none"
            />
            <p class="mt-2 text-xs text-subtle">
                {{ filteredItems.length }} of {{ catalog[category].length }}
            </p>
        </div>

        <nav :aria-label="categoryLabel" class="min-h-0 flex-1 overflow-y-auto p-2">
            <p v-if="loading" class="p-3 text-sm text-muted">
                Loading assets...
            </p>
            <p v-else-if="filteredItems.length === 0" class="p-3 text-sm text-muted">
                No assets found.
            </p>
            <ul v-else class="space-y-1">
                <li v-for="item in filteredItems" :key="item.id">
                    <div
                        :class="selectedId === item.id ? 'bg-selected text-white' : 'text-muted hover:bg-hover'"
                        class="flex items-center gap-3 rounded-lg p-2"
                    >
                        <button
                            v-if="item.artwork"
                            type="button"
                            :aria-label="`View artwork: ${item.name}`"
                            aria-haspopup="dialog"
                            class="shrink-0 cursor-zoom-in rounded-lg focus-visible:outline-2 focus-visible:outline-focus"
                            @click="emit('artwork', { src: item.artwork, title: item.name })"
                        >
                            <AssetThumbnail :src="item.thumbnail" />
                        </button>
                        <AssetThumbnail v-else :src="item.thumbnail" />
                        <button
                            type="button"
                            :aria-pressed="selectedId === item.id"
                            class="min-h-18 min-w-0 flex-1 rounded text-left focus-visible:outline-2 focus-visible:outline-focus"
                            @click="emit('select', item.id)"
                        >
                            <span class="block text-sm font-medium leading-5 wrap-break-word">
                                {{ item.name }}
                            </span>
                            <span class="mt-1 block text-xs leading-4 wrap-break-word opacity-80">
                                {{ item.detail }}
                            </span>
                        </button>
                    </div>
                </li>
            </ul>
        </nav>
    </aside>
</template>
