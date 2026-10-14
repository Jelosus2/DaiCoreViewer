<script setup lang="ts">
import GearIcon from "./icons/GearIcon.vue";

defineProps<{ assetsOpen: boolean; }>();

const emit = defineEmits<{
    assets: [];
    settings: [];
}>();

const siteIconUrl = `${import.meta.env.BASE_URL}game-icon.png`;

function refreshSite() {
    window.location.reload();
}
</script>

<template>
    <header class="shrink-0 border-b border-line bg-sidebar px-3 py-2 lg:px-5 lg:py-3">
        <nav aria-label="Main navigation" class="flex items-center justify-between gap-2">
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

            <div class="flex shrink-0 items-center gap-1">
                <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-controls="asset-picker"
                    :aria-expanded="assetsOpen"
                    class="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted hover:bg-hover hover:text-white focus-visible:outline-2 focus-visible:outline-focus lg:hidden"
                    @click="emit('assets')"
                >
                    <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                        <path d="M3 5h7l2 3h9v12H3z" stroke-linejoin="round" />
                    </svg>
                    Assets
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
