<script setup lang="ts">
import type { SpineCatalog, ViewerCategory } from "@/types/viewer";
import { viewerCategories } from "@/types/viewer";

import { computed, ref, watch } from "vue";

const props = defineProps<{
    catalog: SpineCatalog;
    category: ViewerCategory;
    selectedId: string | null;
    loading: boolean;
}>();

const emit = defineEmits<{
    category: [category: ViewerCategory];
    select: [id: string];
}>();

const query = ref("");
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
        class="flex max-h-96 min-h-0 shrink-0 flex-col border-b border-line bg-sidebar lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r"
    >
        <div class="border-b border-line p-4">
            <h2 class="font-semibold">Assets</h2>

            <div class="mt-3 grid grid-cols-2 gap-1" aria-label="Asset categories">
                <button
                    v-for="tab in viewerCategories"
                    :key="tab.id"
                    type="button"
                    :aria-pressed="category === tab.id"
                    :class="category === tab.id
                        ? 'bg-selected text-white'
                        : 'text-muted hover:bg-hover'"
                    class="rounded px-2 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-focus"
                    @click="emit('category', tab.id)"
                >
                    {{ tab.label }}
                    <span class="text-xs opacity-75">{{ catalog[tab.id].length }}</span>
                </button>
            </div>

            <label for="asset-search" class="mt-4 block text-sm text-muted">
                Search {{ categoryLabel }}
            </label>
            <input
                id="asset-search"
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
                    <button
                        type="button"
                        :aria-pressed="selectedId === item.id"
                        :class="selectedId === item.id
                            ? 'bg-selected text-white'
                            : 'text-muted hover:bg-hover'"
                        class="w-full rounded px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-focus"
                        @click="emit('select', item.id)"
                    >
                        <span class="block truncate font-medium">{{ item.name }}</span>
                        <span class="block truncate text-xs opacity-80">{{ item.detail }}</span>
                    </button>
                </li>
            </ul>
        </nav>
    </aside>
</template>
