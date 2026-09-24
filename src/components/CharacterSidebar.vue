<script setup lang="ts">
import type { SpineManifest } from "@/types/spine";

import { computed, ref } from "vue";

const props = defineProps<{
    characters: SpineManifest["characters"],
    selectedId: string | null;
    loading: boolean;
}>();

const emit = defineEmits<{
    select: [id: string];
}>();

const query = ref("");
const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

const filteredCharacters = computed(() => {
    const search = query.value.trim().toLocaleLowerCase();

    return Object.entries(props.characters)
        .map(([id, character]) => ({
            id,
            name: character.names.english ?? character.names.alias ?? character.names.local ?? id,
            alias: character.names.alias,
            readyCount: Object.values(character.skins).filter((model) => model.render.status === "ready").length,
            modelCount: Object.keys(character.skins).length,
            searchText: [
                id,
                character.names.english,
                character.names.local,
                character.names.alias,
                ...Object.keys(character.skins)
            ].filter((value) => value !== null).join(" ").toLocaleLowerCase()
        }))
        .filter((character) => character.searchText.includes(search))
        .sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.id, b.id));
});
</script>

<template>
    <aside
        class="flex max-h-80 min-h-0 shrink-0 flex-col border-b border-line bg-sidebar lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r"
    >
        <div class="border-b border-line p-4">
            <h2 class="font-semibold">Characters</h2>
            <label for="character-search" class="mt-4 block text-sm text-muted">
                Search
            </label>
            <input
                id="character-search"
                v-model="query"
                type="search"
                placeholder="Name or ID"
                class="mt-1 w-full rounded border border-line bg-control px-3 py-2 text-white focus:border-focus focus:outline-none"
            />
            <p class="mt-2 text-xs text-subtle">
                {{ filteredCharacters.length }} of {{ Object.keys(characters).length }}
            </p>
        </div>

        <nav aria-label="Characters" class="min-h-0 flex-1 overflow-y-auto p-2">
            <p v-if="loading" class="p-3 text-sm text-muted">
                Loading characters...
            </p>
            <p v-else-if="filteredCharacters.length === 0" class="p-3 text-sm text-muted">
                No characters found.
            </p>
            <ul v-else class="space-y-1">
                <li v-for="character in filteredCharacters" :key="character.id">
                    <button
                        type="button"
                        :aria-pressed="selectedId === character.id"
                        :class="selectedId === character.id
                            ? 'bg-selected text-white'
                            : 'text-muted hover:bg-hover'"
                        class="w-full rounded px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-focus"
                        @click="emit('select', character.id)"
                    >
                        <span class="block truncate font-medium">
                            {{ character.name }}
                        </span>
                        <span class="block truncate text-xs opacity-80">
                            {{ character.alias }} · {{ character.id }}
                        </span>
                        <span class="block text-xs opacity-80">
                            {{ character.readyCount }}/{{ character.modelCount }} ready
                        </span>
                    </button>
                </li>
            </ul>
        </nav>
    </aside>
</template>
