<script setup lang="ts">
defineProps<{
    fullscreen: boolean;
}>();
</script>

<template>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path v-if="fullscreen" d="M9 3v6H3m12-6v6h6M9 21v-6H3m12 6v-6h6" />
        <path v-else d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" />
    </svg>
</template>
