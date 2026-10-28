<script setup lang="ts">
import type { ModelLayerGroup } from "@/types/layers";

import LayersIcon from "./icons/LayersIcon.vue";
import CloseIcon from "./icons/CloseIcon.vue";

import { computed, onBeforeUnmount, ref, useId, useTemplateRef } from "vue";

const props = defineProps<{ groups: ModelLayerGroup[] }>();

const emit = defineEmits<{
    slot: [id: string, enabled: boolean];
    attachment: [id: string, name: string, enabled: boolean];
    reset: [];
}>();

const dialog = useTemplateRef<HTMLDialogElement>("dialog");
const titleId = useId();
const panelId = useId();
const query = ref("");
const expanded = ref(new Set<string>());

const hiddenCount = computed(() => props.groups.reduce((sum, group) => sum + group.slots.reduce((count, slot) =>
    count + slot.attachments.filter((attachment) => !slot.enabled || !attachment.enabled).length, 0), 0));

const filtered = computed(() => {
    const search = query.value.trim().toLocaleLowerCase();

    return props.groups.map((group) => ({
        ...group,
        slots: group.slots.flatMap((slot) => {
            const matches = `${group.name} ${slot.name}`.toLocaleLowerCase().includes(search);
            const attachments = slot.attachments.filter((attachment) => matches || attachment.name.toLocaleLowerCase().includes(search));

            return attachments.length ? [{ ...slot, attachments }] : [];
        })
    })).filter((group) => group.slots.length);
});

function close() {
    dialog.value?.close();
}

function toggle(id: string, event: Event) {
    if (query.value.trim())
        return;

    const next = new Set(expanded.value);

    if ((event.target as HTMLDetailsElement).open)
        next.add(id);
    else
        next.delete(id);

    expanded.value = next;
}

function onBackdropClick(event: MouseEvent) {
    const element = dialog.value;
    if (!element || event.target !== element)
        return;

    const rect = element.getBoundingClientRect();

    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
        close();
}

onBeforeUnmount(close);
</script>

<template>
    <div data-layer-controls>
        <button type="button" aria-label="Layers" aria-haspopup="dialog" :aria-controls="panelId" title="Layers" class="grid size-11 place-items-center rounded-lg border border-line bg-control text-muted shadow-lg hover:bg-hover hover:text-white focus-visible:outline-2 focus-visible:outline-focus lg:size-10" @click="dialog?.showModal()">
            <LayersIcon class="size-5" aria-hidden="true" focusable="false" />
        </button>

        <dialog :id="panelId" ref="dialog" :aria-labelledby="titleId" class="layers-dialog" @cancel.prevent="close" @click="onBackdropClick" @pointerdown.stop @wheel.stop>
            <header class="border-b border-line p-4">
                <div class="flex items-center justify-between gap-3">
                    <h2 :id="titleId" class="text-lg font-semibold">Layers</h2>
                    <button type="button" aria-label="Close layers" class="grid size-11 place-items-center rounded-lg text-muted hover:bg-hover" @click="close">
                        <CloseIcon class="size-5" aria-hidden="true" focusable="false" />
                    </button>
                </div>
                <input v-model="query" autofocus type="search" aria-label="Search slots or attachments" placeholder="Search slots or attachments" class="mt-2 min-h-11 w-full rounded-lg border border-line bg-control px-3 text-sm text-white">
                <p class="mt-3 text-xs leading-relaxed text-subtle">Expand a slot to adjust its attachments. Enabled parts follow the animation.</p>
            </header>

            <div class="min-h-0 overflow-y-auto overscroll-contain px-4 py-3">
                <p v-if="!filtered.length" role="status" class="py-4 text-sm text-muted">No matching layers.</p>

                <section v-for="group in filtered" :key="group.id" class="mb-5 last:mb-0">
                    <h3 class="mb-2 break-all text-xs font-medium text-focus">{{ group.name }}</h3>

                    <details v-for="slot in group.slots" :key="slot.id" :open="Boolean(query.trim()) || expanded.has(slot.id)" class="border-b border-line/50" @toggle="toggle(slot.id, $event)">
                        <summary class="min-h-11 cursor-pointer py-1 text-sm text-muted marker:text-subtle">
                            <label class="ml-1 inline-flex min-h-11 max-w-[90%] cursor-pointer items-center gap-3 align-middle" @click.stop>
                                <input type="checkbox" :checked="slot.enabled" :aria-label="`Toggle slot ${slot.name}`" class="size-4 shrink-0 accent-focus" @change="emit('slot', slot.id, ($event.target as HTMLInputElement).checked)">
                                <span class="break-all">{{ slot.name }}</span>
                                <span class="ml-auto shrink-0 text-xs text-subtle">{{ slot.attachments.length }}</span>
                            </label>
                        </summary>

                        <div v-if="Boolean(query.trim()) || expanded.has(slot.id)" class="pb-2 pl-5">
                            <label v-for="attachment in slot.attachments" :key="attachment.name" class="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-muted" :class="{ 'opacity-50': !slot.enabled }">
                                <input type="checkbox" :checked="slot.enabled && attachment.enabled" :disabled="!slot.enabled" :aria-label="`Toggle attachment ${attachment.name} in ${slot.name}`" class="size-4 shrink-0 accent-focus" @change="emit('attachment', slot.id, attachment.name, ($event.target as HTMLInputElement).checked)">
                                <span class="break-all">{{ attachment.name }}</span>
                            </label>
                        </div>
                    </details>
                </section>
            </div>

            <footer class="flex items-center justify-between gap-3 border-t border-line p-4 text-sm">
                <span class="text-subtle">{{ hiddenCount }} hidden</span>
                <button type="button" :disabled="hiddenCount === 0" class="min-h-11 rounded-lg px-3 text-muted hover:bg-hover disabled:opacity-40" @click="emit('reset')">Reset all</button>
                <button type="button" class="min-h-11 rounded-lg bg-focus px-4 font-medium text-page" @click="close">Done</button>
            </footer>
        </dialog>
    </div>
</template>

<style scoped>
.layers-dialog {
    position: fixed;
    inset: 0;
    width: calc(100% - 2rem);
    height: min(60dvh, 34rem);
    min-height: min(22rem, calc(100dvh - 2rem));
    max-height: calc(100dvh - 2rem);
    margin: auto auto 1rem;
    overflow: hidden;
    padding: 0;
    border: 1px solid var(--color-line);
    border-radius: 18px;
    color: white;
    background: var(--color-sidebar);
    box-shadow: 0 18px 70px #0007;
}

.layers-dialog[open] {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
}

.layers-dialog::backdrop {
    background: #0002;
}

.layers-dialog :is(button, input, summary):focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
}

@media (min-width: 640px) {
    .layers-dialog {
        width: min(23rem, calc(100% - 2rem));
        height: calc(100dvh - 2rem);
        margin: 1rem 1rem 1rem auto;
    }
}
</style>
