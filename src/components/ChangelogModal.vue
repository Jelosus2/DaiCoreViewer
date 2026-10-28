<script setup lang="ts">
import type { SpineCatalog } from "@/types/viewer";
import type { ChangelogTarget } from "@/types/changelog";

import CloseIcon from "./icons/CloseIcon.vue";
import HistoryIcon from "./icons/HistoryIcon.vue";

import { changelog } from "@/data/changelog";
import { parseChangelogText } from "@/utils/parseChangelogText";
import { computed, onBeforeUnmount, onMounted, ref, useId, useTemplateRef, watch } from "vue";

const props = defineProps<{
    ready: boolean;
    catalog: SpineCatalog
}>();

const emit = defineEmits<{
    select: [target: ChangelogTarget];
    pending: [value: boolean];
    shown: []
}>();

const open = defineModel<boolean>("open", { required: true });
const dialog = useTemplateRef<HTMLDialogElement>("dialog");
const titleId = useId();
const seenKey = "daicoreviewer:changelog-seen";
const hiddenKey = "daicoreviewer:changelog-hidden";
const latest = changelog[0]?.id;
const neverShowAgain = ref(readStored(hiddenKey) === "true");
const preferenceError = ref(false);
const pending = ref(Boolean(latest && !neverShowAgain.value && readStored(seenKey) !== latest));

watch(pending, (value) => emit("pending", value), { immediate: true, flush: "sync" });
watch(() => props.ready, maybeOpen, { flush: "post" });
watch(open, syncOpen, { flush: "post" });

watch(neverShowAgain, (value) => {
    preferenceError.value = !writeStored(hiddenKey, String(value));
}, { flush: "sync" });

const releases = computed(() => changelog.map((release) => ({
    ...release,
    dateLabel: new Date(`${release.date}T00:00:00Z`).toLocaleDateString(undefined, { dateStyle: "long", timeZone: "UTC" }),
    sections: release.sections.map((section) => ({
        ...section,
        lines: section.lines.map((line) => parseChangelogText(line, props.catalog))
    }))
})));

function readStored(key: string) {
    try
    {
        return window.localStorage.getItem(key);
    }
    catch
    {
        return null;
    }
}

function writeStored(key: string, value: string) {
    try
    {
        window.localStorage.setItem(key, value);
        return true;
    }
    catch
    {
        return false;
    }
}

function maybeOpen() {
    if (props.ready && pending.value && !document.hidden)
        open.value = true;
}

function syncOpen() {
    const element = dialog.value;
    if (!element)
        return;

    if (open.value && !element.open)
    {
        element.showModal();
        pending.value = false;
        emit("shown");

        if (latest)
            preferenceError.value = !writeStored(seenKey, latest) || preferenceError.value;
    }
    else if (!open.value && element.open)
    {
        element.close();
    }
}

function close() {
    dialog.value?.close();
    open.value = false;
}

function onBackdropClick(event: MouseEvent) {
    const element = dialog.value;
    if (!element || event.target !== element)
        return;

    const rect = element.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
        close();
}

onMounted(() => {
    document.addEventListener("visibilitychange", maybeOpen);

    syncOpen();
    maybeOpen();
});

onBeforeUnmount(() => {
    document.removeEventListener("visibilitychange", maybeOpen);
    dialog.value?.close();
});
</script>

<template>
    <Teleport to="body">
        <dialog ref="dialog" :aria-labelledby="titleId" class="changelog-dialog" @cancel.prevent="close" @close="open = false" @click="onBackdropClick">
            <header class="flex items-center gap-3 border-b border-line bg-linear-to-br from-focus/15 to-transparent p-4 sm:p-6">
                <span class="grid size-11 shrink-0 place-items-center rounded-2xl border border-focus/30 bg-focus/10 text-focus">
                    <HistoryIcon class="size-6" aria-hidden="true" focusable="false" />
                </span>
                <div class="min-w-0 flex-1">
                    <p class="text-xs tracking-widest text-focus">DAICOREVIEWER</p>
                    <h2 :id="titleId" class="text-xl font-semibold sm:text-2xl">What's new</h2>
                </div>
                <button type="button" autofocus aria-label="Close changelog" class="grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-hover hover:text-white" @click="close">
                    <CloseIcon class="size-5" aria-hidden="true" focusable="false" />
                </button>
            </header>

            <div class="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-7">
                <p v-if="!releases.length" class="text-muted">No updates yet.</p>

                <details
                    v-for="(release, index) in releases"
                    :key="release.id"
                    :open="index === 0"
                    class="mb-7 border-b border-line pb-7 last:mb-0 last:border-0 last:pb-0"
                >
                    <summary class="cursor-pointer rounded-lg text-lg font-semibold leading-relaxed marker:text-focus">
                        {{ release.title }}
                        <time :datetime="release.date" class="mt-2 block text-xs font-normal text-subtle">
                            {{ release.dateLabel }}
                        </time>
                    </summary>

                    <div class="space-y-8 pt-6">
                        <section v-for="section in release.sections" :key="section.title">
                            <h3 class="inline-flex rounded-md bg-focus/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-focus">
                                {{ section.title }}
                            </h3>

                            <ul role="list" class="mt-4 space-y-4 text-[0.9375rem] leading-7 text-muted">
                                <li
                                    v-for="(parts, lineIndex) in section.lines"
                                    :key="lineIndex"
                                    class="border-l-2 border-line/60 pl-4 wrap-break-word"
                                >
                                    <template v-for="(part, partIndex) in parts" :key="partIndex">
                                        <button v-if="part.target" type="button" class="changelog-link" @click="emit('select', part.target)">{{ part.text }}</button><template v-else>{{ part.text }}</template>
                                    </template>
                                </li>
                            </ul>
                        </section>
                    </div>
                </details>
            </div>

            <footer class="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-page/50 p-4 sm:px-6">
                <label class="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-muted">
                    <input v-model="neverShowAgain" type="checkbox" class="size-4 shrink-0 accent-focus">
                    <span>Never show this again<small class="block text-xs text-subtle">You can always open it from the navbar.</small></span>
                </label>
                <button type="button" class="min-h-11 w-full rounded-xl bg-focus px-5 py-2 text-sm font-semibold text-page hover:brightness-110 sm:w-auto" @click="close">Continue</button>
                <p v-if="preferenceError" role="status" class="w-full text-xs text-amber-200">Your browser could not save this preference. The changelog may appear again next time.</p>
            </footer>
        </dialog>
    </Teleport>
</template>

<style scoped>
.changelog-dialog {
    position: fixed;
    inset: 0;
    width: min(46rem, calc(100% - 2rem));
    max-height: calc(100dvh - 2rem);
    margin: auto;
    overflow: hidden;
    padding: 0;
    border: 1px solid var(--color-line);
    border-radius: 20px;
    color: white;
    background: var(--color-sidebar);
    box-shadow: 0 24px 90px #0008;
}

.changelog-dialog[open] {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
}

.changelog-dialog::backdrop {
    background: #090b10bd;
    backdrop-filter: blur(7px);
}

.changelog-link {
    color: #93c5fd;
    text-align: left;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
}

.changelog-link:hover {
    color: #bfdbfe;
}

.changelog-dialog :is(button, input, summary):focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 3px;
}
</style>
