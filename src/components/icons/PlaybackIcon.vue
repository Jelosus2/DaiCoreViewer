<script setup lang="ts">
defineProps<{
    state: "play" | "pause" | "replay";
}>();
</script>

<template>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path v-if="state === 'replay'" d="M4 10a8 8 0 1 1 1 8M4 4v6h6" />
        <path v-else-if="state === 'play'" d="m9 5 10 7-10 7z" fill="currentColor" stroke="none" />
        <path v-else d="M8 5v14M16 5v14" stroke-width="3" />
    </svg>
</template>
