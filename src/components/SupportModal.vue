<script setup lang="ts">
import PatreonIcon from "./icons/PatreonIcon.vue";
import kofiIcon from "../assets/brand/kofi.png";

import { version } from "../../package.json";
import { onBeforeUnmount, onMounted, ref, useId, useTemplateRef, watch } from "vue";

const props = defineProps<{ ready: boolean }>();

const open = defineModel<boolean>("open", { required: true });
const dialog = useTemplateRef<HTMLDialogElement>("dialog");
const titleId = useId();
const descriptionId = useId();
const neverShowAgain = ref(false);
const preferenceError = ref(false);
const seenKey = "daicoreviewer:support-seen-version";
const hiddenKey = "daicoreviewer:support-hidden";

let claimed = false;
let firstVisitRemaining = 5 * 60 * 1000;
let firstVisitStartedAt = 0;
let firstVisitTimer: number | undefined;

watch(() => props.ready, maybeOpen, { flush: "post" });
watch(open, syncOpen, { flush: "post" });
watch(neverShowAgain, (value) => {
    preferenceError.value = !writeStored(hiddenKey, String(value));
}, { flush: "sync" });

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
    if (!dialog.value || !props.ready || claimed || document.hidden || readStored(hiddenKey) === "true")
        return;

    const seenVersion = readStored(seenKey);
    if (seenVersion === version || (seenVersion === null && firstVisitRemaining > 0))
        return;

    claimed = true;
    open.value = true;
}

function syncOpen() {
    const element = dialog.value;
    if (!element)
        return;

    if (open.value && !element.open)
    {
        element.showModal();
        writeStored(seenKey, version);
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

function updateFirstVisitTimer() {
    if (firstVisitTimer !== undefined)
    {
        firstVisitRemaining = Math.max(0, firstVisitRemaining - (performance.now() - firstVisitStartedAt));
        clearTimeout(firstVisitTimer);
        firstVisitTimer = undefined;
    }

    if (document.hidden || claimed || readStored(hiddenKey) === "true")
        return;

    if (readStored(seenKey) !== null || firstVisitRemaining === 0)
    {
        maybeOpen();
        return;
    }

    firstVisitStartedAt = performance.now();
    firstVisitTimer = setTimeout(() => {
        firstVisitTimer = undefined;
        firstVisitRemaining = 0;
        maybeOpen();
    }, firstVisitRemaining);
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
    document.addEventListener("visibilitychange", updateFirstVisitTimer);
    updateFirstVisitTimer();
});

onBeforeUnmount(() => {
    document.removeEventListener("visibilitychange", updateFirstVisitTimer);
    clearTimeout(firstVisitTimer);
    dialog.value?.close();
});
</script>

<template>
    <Teleport to="body">
        <dialog
            ref="dialog"
            :aria-labelledby="titleId"
            :aria-describedby="descriptionId"
            class="support-dialog"
            @cancel.prevent="close"
            @close="open = false"
            @click="onBackdropClick"
        >
            <button type="button" autofocus class="support-close" aria-label="Close support message" @click="close">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                    <path d="m6 6 12 12M18 6 6 18" />
                </svg>
            </button>

            <div class="support-content">
                <div class="support-emblem" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="29" height="29" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
                    </svg>
                </div>

                <p class="support-eyebrow">DAICOREVIEWER</p>
                <h2 :id="titleId">Enjoying the viewer?</h2>
                <p :id="descriptionId" class="support-description">
                    If you enjoy exploring DaiCoreViewer, you can support my work and future updates.
                    Every bit of support is appreciated.
                </p>

                <div class="support-links">
                    <a href="https://ko-fi.com/jelosus1" target="_blank" rel="noopener noreferrer" class="support-link support-kofi">
                        <span class="support-platform-icon" aria-hidden="true">
                            <img :src="kofiIcon" alt="" width="25" height="25">
                        </span>
                        <span>
                            <strong>Ko-fi</strong>
                            <span class="support-link-note">Support my work</span>
                        </span>
                        <span class="support-external" aria-hidden="true">&#8599;</span>
                        <span class="support-sr-only"> (opens in a new tab)</span>
                    </a>

                    <a href="https://www.patreon.com/cw/jelosus1" target="_blank" rel="noopener noreferrer" class="support-link support-patreon">
                        <span class="support-platform-icon" aria-hidden="true">
                            <PatreonIcon width="25" height="25" focusable="false" />
                        </span>
                        <span>
                            <strong>Patreon</strong>
                            <span class="support-link-note">Become a patron</span>
                        </span>
                        <span class="support-external" aria-hidden="true">&#8599;</span>
                        <span class="support-sr-only"> (opens in a new tab)</span>
                    </a>
                </div>

                <p class="support-thanks">Support is optional. The viewer is free to enjoy.</p>
            </div>

            <div class="support-footer">
                <label class="support-preference">
                    <input v-model="neverShowAgain" type="checkbox">
                    <span>Never show this again<small>Including future updates.</small></span>
                </label>

                <button type="button" class="support-continue" @click="close">Continue</button>

                <p v-if="preferenceError" role="status" class="support-storage-error">
                    Your browser could not save this preference. This message may appear again next time.
                </p>
            </div>
        </dialog>
    </Teleport>
</template>

<style scoped>
.support-dialog {
    position: fixed;
    inset: 0;
    margin: auto;
    width: min(34rem, calc(100% - 2rem));
    max-height: calc(100dvh - 2rem);
    overflow-y: auto;
    padding: 0;
    border: 1px solid #75634e;
    border-radius: 24px;
    color: #f4f1ec;
    background: #292a2e;
    box-shadow: 0 24px 90px #0008;
}

.support-dialog::backdrop {
    background: #090b10bd;
    backdrop-filter: blur(7px);
}

.support-dialog[open] {
    animation: support-enter .2s ease-out;
}

.support-content {
    padding: 36px 32px 25px;
    text-align: center;
    background: radial-gradient(ellipse at 50% 0%, #c7aa831a, transparent 70%);
}

.support-close {
    position: absolute;
    top: 10px;
    right: 10px;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 12px;
    color: #c6c6cb;
    background: transparent;
    cursor: pointer;
}

.support-close:hover {
    background: #ffffff0a;
    color: white;
}

.support-emblem {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    margin: 0 auto 20px;
    border: 1px solid #c7aa833d;
    border-radius: 21px;
    color: #dec09b;
    background: #c7aa8310;
}

.support-eyebrow {
    margin: 0 0 10px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: .18em;
    color: #c7aa83;
}

h2 {
    margin: 0;
    font-size: clamp(1.7rem, 5vw, 2.15rem);
    font-weight: 650;
    letter-spacing: -.035em;
    line-height: 1.2;
    text-wrap: balance;
}

.support-description {
    max-width: 26rem;
    margin: 15px auto 25px;
    color: #c6c6cb;
    font-size: 14px;
    line-height: 1.75;
}

.support-links {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    text-align: left;
}

.support-link {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    min-height: 88px;
    padding: 16px 13px;
    border: 1px solid #555159;
    border-radius: 15px;
    color: inherit;
    background: #ffffff03;
    text-decoration: none;
    transition: border-color .16s, background .16s, transform .16s;
}

.support-link:hover {
    transform: translateY(-2px);
    background: #ffffff08;
    border-color: #c7aa83;
}

.support-platform-icon {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 38px;
    height: 42px;
    border-radius: 12px;
    background: #efaa9a10;
}

.support-patreon .support-platform-icon {
    color: white;
    background: #f2d5c010;
}

.support-link strong {
    display: block;
    font-size: 16px;
    font-weight: 600;
}

.support-link-note {
    display: block;
    margin-top: 4px;
    color: #a7a8af;
    font-size: 11px;
}

.support-external {
    margin-left: auto;
    align-self: flex-start;
    color: #a7a8af;
    font-size: 17px;
}

.support-thanks {
    margin: 21px 0 0;
    color: #a7a8af;
    font-size: 12px;
}

.support-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 21px 28px;
    border-top: 1px solid #ffffff0d;
    background: #20212477;
}

.support-preference {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    color: #d1d0d4;
    font-size: 12px;
    cursor: pointer;
}

.support-preference input {
    width: 17px;
    height: 17px;
    margin: 0;
    accent-color: #c7aa83;
}

.support-preference small {
    display: block;
    margin-top: 3px;
    font-size: 11px;
    color: #a7a8af;
}

.support-continue {
    min-height: 44px;
    padding: 11px 17px;
    border: 1px solid #c7aa8355;
    border-radius: 11px;
    background: #c7aa83;
    color: #29231d;
    font-size: 12px;
    font-weight: 650;
    cursor: pointer;
}

.support-continue:hover {
    background: #d9bd98;
}

.support-dialog :is(button, a, input):focus-visible {
    outline: 2px solid #dec09b;
    outline-offset: 4px;
}

.support-storage-error {
    flex-basis: 100%;
    margin: 0;
    color: #f4cc93;
    font-size: 12px;
    line-height: 1.6;
}

.support-sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}

@keyframes support-enter {
    from {
        opacity: 0;
        transform: translateY(8px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@media (max-width: 420px) {
    .support-content {
        padding: 32px 20px 23px;
    }

    .support-links {
        grid-template-columns: 1fr;
        gap: 10px;
    }

    .support-link {
        min-height: 73px;
    }

    .support-footer {
        padding: 16px 20px;
        gap: 10px;
    }

    .support-continue {
        width: 100%;
    }
}

@media (prefers-reduced-motion: reduce) {
    .support-dialog[open] {
        animation: none;
    }

    .support-link {
        transition: none;
    }

    .support-link:hover {
        transform: none;
    }
}
</style>
