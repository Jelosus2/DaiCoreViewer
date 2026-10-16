<script setup lang="ts">
import ImageIcon from "./icons/ImageIcon.vue";

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
        <ImageIcon
            v-else
            class="size-7 text-subtle"
            aria-hidden="true"
            focusable="false"
        />
    </span>
</template>
