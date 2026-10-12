<script setup lang="ts">
defineProps<{
    enabled: boolean;
}>();
</script>

<template>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="3" />
        <path d="M10 9a3 3 0 1 0 0 6M18 9a3 3 0 1 0 0 6" />
        <path v-if="!enabled" d="m3 21 18-18" />
    </svg>
</template>
