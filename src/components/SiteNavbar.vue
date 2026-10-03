<script setup lang="ts">
import GearIcon from './icons/GearIcon.vue';

const emit = defineEmits<{
    settings: [];
}>();

function refreshSite() {
    window.location.reload();
}
</script>

<template>
    <header class="shrink-0 border-b border-line bg-sidebar px-4 py-3 sm:px-5">
        <nav aria-label="Main navigation" class="flex items-center justify-between gap-4">
            <button
                type="button"
                aria-label="DaiCoreViewer — refresh site"
                class="rounded text-left text-xl font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus sm:text-2xl"
                @click="refreshSite"
            >
                <span class="text-focus">Dai</span><span class="text-white">Core</span><span class="font-medium text-muted">Viewer</span>
            </button>

            <button
                type="button"
                aria-haspopup="dialog"
                class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-hover hover:text-white focus-visible:outline-2 focus-visible:outline-focus"
                @click="emit('settings')"
            >
                <GearIcon class="size-5 shrink-0" aria-hidden="true" focusable="false" />
                Settings
            </button>
        </nav>
    </header>
</template>
