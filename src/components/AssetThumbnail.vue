<script setup lang="ts">
import { computed, ref, watch } from "vue";

const props = defineProps<{ src?: string }>();
const failed = ref(false);
const imageUrl = computed(() => props.src ? `${import.meta.env.BASE_URL}${props.src}` : undefined);

watch(() => props.src, () => {
    failed.value = false;
});
</script>

<template>
    <span class="flex h-18 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-stage">
        <img
            v-if="imageUrl && !failed"
            :src="imageUrl"
            alt=""
            width="216"
            height="164"
            loading="lazy"
            decoding="async"
            class="h-full w-full object-contain"
            @error="failed = true"
        >
        <svg
            v-else
            viewBox="0 0 24 24"
            class="size-7 text-subtle"
            fill="none"
            stroke="currentColor"
            stroke-width="1.3"
            aria-hidden="true"
        >
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <circle cx="8" cy="9" r="1.5" />
            <path d="m4 17 5-5 4 4 3-3 5 5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
    </span>
</template>
