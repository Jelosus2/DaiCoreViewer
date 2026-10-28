<script setup lang="ts">
import GearIcon from "./icons/GearIcon.vue";
import PatreonIcon from "./icons/PatreonIcon.vue";
import kofiIcon from "../assets/brand/kofi.png";
import FolderIcon from "./icons/FolderIcon.vue";
import HistoryIcon from "./icons/HistoryIcon.vue";

defineProps<{ assetsOpen: boolean; }>();

const emit = defineEmits<{
    assets: [];
    settings: [];
    changelog: [];
}>();

const siteIconUrl = `${import.meta.env.BASE_URL}game-icon.png`;

function refreshSite() {
    window.location.reload();
}
</script>

<template>
    <header class="shrink-0 border-b border-line bg-sidebar px-3 py-2 lg:px-5 lg:py-3">
        <nav aria-label="Main navigation" class="flex flex-wrap items-center justify-between gap-2">
            <button
                type="button"
                aria-label="DaiCoreViewer — refresh site"
                class="flex min-h-11 min-w-0 items-center gap-2 rounded text-left text-sm font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus sm:text-2xl"
                @click="refreshSite"
            >
                <img
                    :src="siteIconUrl"
                    alt=""
                    aria-hidden="true"
                    width="32"
                    height="32"
                    class="size-6 shrink-0 rounded-md sm:size-8"
                >
                <span class="whitespace-nowrap">
                    <span class="text-focus">Dai</span><span class="text-white">Core</span><span class="font-medium text-muted">Viewer</span>
                </span>
            </button>

            <div class="ml-auto flex shrink-0 items-center gap-1">
                <a
                    href="https://ko-fi.com/jelosus1"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Support me on Ko-fi (opens in a new tab)"
                    title="Support me on Ko-fi"
                    class="grid size-11 place-items-center rounded-lg transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
                >
                    <img :src="kofiIcon" alt="" width="24" height="24" aria-hidden="true">
                </a>
                <a
                    href="https://www.patreon.com/cw/jelosus1"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Support me on Patreon (opens in a new tab)"
                    title="Support me on Patreon"
                    class="grid size-11 place-items-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-white focus-visible:outline-2 focus-visible:outline-focus"
                >
                    <PatreonIcon class="size-6" aria-hidden="true" focusable="false" />
                </a>
                <button
                    type="button"
                    aria-label="Browse assets"
                    aria-haspopup="dialog"
                    aria-controls="asset-picker"
                    :aria-expanded="assetsOpen"
                    class="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-2 text-sm text-muted hover:bg-hover hover:text-white focus-visible:outline-2 focus-visible:outline-focus lg:hidden"
                    @click="emit('assets')"
                >
                    <FolderIcon class="size-5" aria-hidden="true" focusable="false" />
                    <span class="hidden sm:inline">Assets</span>
                </button>
                <button
                    type="button"
                    aria-label="Changelog"
                    aria-haspopup="dialog"
                    title="Changelog"
                    class="grid size-11 place-items-center rounded-lg text-muted hover:bg-hover hover:text-white focus-visible:outline-2 focus-visible:outline-focus"
                    @click="emit('changelog')"
                >
                    <HistoryIcon class="size-5" aria-hidden="true" focusable="false" />
                </button>
                <button
                    type="button"
                    aria-label="Settings"
                    aria-haspopup="dialog"
                    class="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-2 text-sm text-muted transition-colors hover:bg-hover hover:text-white focus-visible:outline-2 focus-visible:outline-focus sm:px-3"
                    @click="emit('settings')"
                >
                    <GearIcon class="size-5 shrink-0" aria-hidden="true" focusable="false" />
                    <span class="hidden sm:inline">Settings</span>
                </button>
            </div>
        </nav>
    </header>
</template>
