<script setup lang="ts">
import type { MachairodusTargetPhase, MachairodusTargetView } from "@/minigames/machairodusMotion";

import { targetWidth, targetTilt } from "@/minigames/machairodusMotion";
import { computed, onMounted, onUnmounted, ref, shallowRef, watch, useId } from "vue";

const props = defineProps<{
    active: boolean;
    sprites: Record<string, string>;
    playAction: (index: number) => boolean;
    targetsChanged: (targets: MachairodusTargetView[]) => void;
}>();

interface Target {
    id: number;
    slot: number;
    gold: boolean;
    phase: MachairodusTargetPhase;
    readyAt: number;
    exitAt: number;
}

const remaining = ref(15);
const score = ref(0);
const bullets = ref(12);
const reloading = ref(false);
const targets = shallowRef<Target[]>([]);
const reloadFill = ref(0);
const reloadClipId = useId();

const slots = [
    [183.936, -67.936], [310.912, -67.936], [437.888, -67.936],
    [564.864, -67.936], [691.84, -67.936], [818.816, -67.936],
    [864.896, -410.976], [737.92, -410.976], [610.944, -410.976],
    [483.968, -410.976], [356.992, -410.976], [230.016, -410.976]
] as const;

const targetUiScale = targetWidth / 252;

const hitRegions = [
    { x: 17.4, y: 95.772, width: 54.9, height: 85.186 },
    { x: 17.874, y: -43.91, width: 111.948, height: 194.18 }
] as const;

const timeDigits = computed(() => String(remaining.value).padStart(2, "0").split(""));
const scoreDigits = computed(() => String(score.value).split(""));
const rank = computed(() => score.value >= 1000 ? 1 : score.value >= 500 ? 2 : 3);

const reloadClipPath = computed(() => {
    const fill = reloadFill.value;

    if (fill <= 0)
        return "";
    if (fill >= 1)
        return "M -252 -314 H -160 V -222 H -252 Z";

    const centerX = -206;
    const centerY = -268;
    const radius = 70;
    const angle = -Math.PI / 2 + fill * 2 * Math.PI;
    const endX = centerX + radius * Math.cos(angle);
    const endY = centerY + radius * Math.sin(angle);

    return `M ${centerX} ${centerY} L ${centerX} ${centerY - radius} A ${radius} ${radius} 0 ${fill > 0.5 ? 1 : 0} 1 ${endX} ${endY} Z`;
});

let running = false;
let elapsed = 0;
let frame = 0;
let lastFrame = 0;
let nextId = 0;
let nextShotAt = 0;
let nextShowAt = 0.5;
let quitAt = Infinity;
let coolAt = Infinity;
let reloadAt = Infinity;

watch(() => props.active, (active) => {
    if (active)
        start();
    else
        stop();
}, { flush: "post" });

function sprite(name: string): string {
    return props.sprites[name] ?? "";
}

function spawnTargets() {
    const available = Array.from({ length: 12 }, (_, index) => index);
    const count = 3 + Math.floor(Math.random() * 3);
    const wave: Target[] = [];
    let goldCount = 0;
    let goldStreak = true;

    for (let index = 0; index < count; index++)
    {
        const pick = Math.floor(Math.random() * available.length);
        const slot = available.splice(pick, 1)[0];

        if (goldStreak && Math.random() * 100 < Math.ceil(100 * 0.5 ** index))
            goldCount++;
        else
            goldStreak = false;

        wave.push({
            id: ++nextId,
            slot,
            gold: false,
            phase: "enter",
            readyAt: elapsed + 0.7,
            exitAt: Infinity
        });
    }

    for (let index = 0; index < goldCount; index++)
        wave[index].gold = true;

    targets.value = wave;
    nextShowAt = Infinity;
    quitAt = elapsed + 5.7;
}

function publishTargets() {
    props.targetsChanged(targets.value.map((target) => {
        const age = target.phase === "exit"
            ? elapsed - (target.exitAt - 0.4)
            : elapsed - (target.readyAt - 0.7);

        return {
            id: target.id,
            x: slots[target.slot][0],
            y: slots[target.slot][1],
            gold: target.gold,
            upper: target.slot >= 6,
            tilt: targetTilt(target.phase, age),
            exitAge: target.phase === "exit" ? age : null
        }
    }));
}

function finish(manual: boolean) {
    if (!running)
        return false;

    running = false;
    props.targetsChanged([]);

    const index = manual ? 63 : score.value <= 500 ? 14 : score.value <= 1000 ? 15: 16;

    props.playAction(index);
}

function shoot(target?: Target) {
    const now = elapsed;

    if (!running || bullets.value <= 0 || now < nextShotAt)
        return;
    if (target && target.phase !== "active")
        return;

    nextShotAt = now + 0.2;

    if (reloading.value)
    {
        reloading.value = false;
        reloadAt = Infinity;
        reloadFill.value = 0;
    }

    props.playAction(10);

    bullets.value--;
    score.value += target ? (target.gold ? 100 : 50) : 0;
    coolAt = now + (bullets.value === 0 ? 0.5 : 3);

    if (target)
    {
        targets.value = targets.value.map((item) => {
            return item.id === target.id
                ? { ...item, phase: "exit", exitAt: now + 0.4 }
                : item
        });

        if (!targets.value.some((item) => item.phase === "enter" || item.phase === "active"))
            quitAt = Math.min(quitAt, now + 0.8);
    }
}

function start() {
    cancelAnimationFrame(frame);

    remaining.value = 15;
    score.value = 0;
    bullets.value = 12;
    reloading.value = false;
    targets.value = [];
    reloadFill.value = 0;

    elapsed = 0;
    lastFrame = 0;
    nextId = 0;
    nextShotAt = 0;
    nextShowAt = 0.5;
    quitAt = Infinity;
    coolAt = Infinity;
    reloadAt = Infinity;
    running = true;

    publishTargets();
    frame = requestAnimationFrame(update);
}

function stop() {
    running = false;
    cancelAnimationFrame(frame)
    targets.value = [];
    props.targetsChanged([]);
}

function update(now: number) {
    if (!running)
        return;

    if (lastFrame === 0)
        lastFrame = now;

    elapsed += Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;

    const time = elapsed;
    remaining.value = Math.ceil(Math.max(0, 15 - time));

    if (time >= 15)
    {
        remaining.value = 0;
        finish(false);
        return;
    }

    if (time >= reloadAt)
    {
        reloadAt = Infinity;
        reloading.value = false;
        bullets.value = 12;
        reloadFill.value = 0;
    }

    if (reloading.value)
        reloadFill.value = Math.max(0, Math.min(1, reloadAt - time));

    if (time >= coolAt)
    {
        coolAt = Infinity;

        if (bullets.value <= 4 && !reloading.value)
        {
            props.playAction(11);

            reloading.value = true;
            reloadAt = time + 1;
            reloadFill.value = 1;
        }
    }

    if (time >= quitAt)
    {
        quitAt = Infinity;
        targets.value = targets.value.map((item) => {
            return item.phase === "exit"
                ? item
                : { ...item, phase: "exit", exitAt: time + 0.4 }
        });

        nextShowAt = time + 0.4;
    }

    if (targets.value.some((item) => time >= item.exitAt || (item.phase === "enter" && time >= item.readyAt)))
    {
        targets.value = targets.value
            .filter((item) => time < item.exitAt)
            .map((item) => {
                return item.phase === "enter" && time >= item.readyAt
                    ? { ...item, phase: "active" }
                    : item
            });
    }

    if (time >= nextShowAt)
        spawnTargets();

    publishTargets();

    frame = requestAnimationFrame(update);
}

onMounted(() => {
    if (props.active)
        start();
});

onUnmounted(stop);
</script>

<template>
    <svg
        class="absolute inset-0 z-10 h-full w-full touch-none"
        viewBox="-960 -540 1920 1080"
        preserveAspectRatio="xMidYMid meet"
        aria-label="Machairodus shooting minigame"
        :style="{
            opacity: active ? 1 : 0,
            pointerEvents: active ? 'auto' : 'none'
        }"
        @wheel.stop.prevent
    >
        <defs>
            <clipPath :id="reloadClipId" clipPathUnits="userSpaceOnUse">
                <path :d="reloadClipPath" />
            </clipPath>
        </defs>

        <rect x="-960" y="-540" width="1920" height="1080" fill="transparent" @pointerdown.prevent="shoot()" />

        <g v-for="target in targets" :key="target.id" :transform="`translate(${slots[target.slot][0]} ${slots[target.slot][1]})`">
            <rect
                v-for="(region, index) in hitRegions"
                :key="index"
                :x="(target.slot >= 6 ? -1 : 1) * region.x * targetUiScale - region.width * targetUiScale / 2"
                :y="-(target.slot >= 6 ? -1 : 1) * region.y * targetUiScale - region.height * targetUiScale / 2"
                :width="region.width * targetUiScale"
                :height="region.height * targetUiScale"
                fill="transparent"
                pointer-events="all"
                class="cursor-crosshair"
                @pointerdown.stop.prevent="shoot(target)"
            />
        </g>

        <g pointer-events="none">
            <image :href="sprite('img_01_01')" x="-929.6" y="-408.7" width="475" height="63" />
            <text x="-652.9" y="-377.2" fill="white" font-size="28" dominant-baseline="middle">1000</text>

            <image :href="sprite('img_01_02')" x="-944.6" y="-355.4" width="403" height="168" />
            <g
                v-for="(digit, index) in scoreDigits"
                :key="`score-${index}`"
                :transform="`translate(${-758.6 - (scoreDigits.length - 1) * 14.19 + index * 28.38} -279.1)`"
            >
                <image
                    v-for="value in 10"
                    :key="value"
                    :href="sprite(`img_02_0${value - 1}`)"
                    x="0" y="0" width="31" height="43"
                    :opacity="digit === String(value - 1) ? 1 : 0"
                />
            </g>
            <image :href="sprite(`img_06_0${rank}`)" x="-610.3" y="-378.5" width="216" height="221" />

            <image :href="sprite('img_01_03')" x="-944.6" y="-214.1" width="403" height="168" />
            <rect x="-741" y="-131" width="11" height="31" fill="#181818" />
            <g
                v-for="(digit, index) in timeDigits"
                :key="`time-${index}`"
                :transform="`translate(${-773.6 + index * 30} -136.9)`"
            >
                <image
                    v-for="value in 10"
                    :key="value"
                    :href="sprite(`img_03_0${value - 1}`)"
                    x="0" y="0" width="31" height="43"
                    :opacity="digit === String(value - 1) ? 1 : 0"
                />
            </g>

            <g v-if="!reloading">
                <image
                    v-for="index in 12" :key="`bullet-${index}`"
                    :href="sprite(index <= bullets ? 'img_99_01' : 'img_99_02')"
                    :x="230 + (index - 1) * 15.47" y="97" width="31" height="58"
                />
            </g>
            <image
                v-if="reloading"
                :href="sprite('img_05_01')"
                x="-252" y="-314" width="92" height="92"
                :clip-path="`url(#${reloadClipId})`"
            />
        </g>

        <image
            :href="sprite('img_exit')"
            x="-914" y="-508" width="216" height="80"
            class="cursor-pointer"
            aria-label="Leave minigame"
            @pointerdown.stop.prevent="finish(true)"
        />
    </svg>
</template>
