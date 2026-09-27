import type { SpineActionConfig, SpineActionItem } from "@/types/spine";

import { parseSpineTap, type ParsedSpineTap } from "./parseSpineTap";
import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { Container, Graphics, Rectangle, UPDATE_PRIORITY } from "pixi.js";

type TrackEntry = ReturnType<Spine["state"]["setAnimation"]>;

interface StagedTap {
    entry: TrackEntry;
    action: ParsedSpineTap;
    duration: number;
    step: number;
    targetTime: number;
}

export function createSpineInteractions(layer: Container, spine: Spine, interaction: SpineActionConfig, showHotspots: boolean) {
    const actions = interaction.items.map((item) => parseSpineTap(item, spine)).filter((action): action is ParsedSpineTap => action !== undefined);
    const hitboxes = new Map<number, Container>();
    const outlines: Graphics[] = [];
    const stages = new Map<number, StagedTap>();
    const orderPositions = new Map<number, number>();
    let tracking = false;
    let destroyed = false;
    let nextTapAt = 0;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    function stopTracking() {
        if (!tracking)
            return;

        spine.ticker.remove(updateStages);
        tracking = false;
    }

    function setActive(index: number, active: boolean) {
        const hitbox = hitboxes.get(index);
        if (!hitbox)
            return;

        hitbox.visible = active;
        hitbox.eventMode = active ? "static" : "none";
    }

    function applyActivation(action: ParsedSpineTap, reverse: boolean) {
        for (const [index, active] of action.activation ?? [])
            setActive(index, reverse ? !active : active);
    }

    function updateStages() {
        for (const [trackIndex, stage] of stages)
        {
            if (spine.state.getCurrent(trackIndex) !== stage.entry)
            {
                stages.delete(trackIndex);
                continue;
            }

            const reached = stage.entry.timeScale > 0
                ? stage.entry.trackTime >= stage.targetTime
                : stage.entry.timeScale < 0 && stage.entry.trackTime <= stage.targetTime;

            if (!reached)
                continue;

            const points = stage.action.clicks!;

            if (stage.step === points.length - 1)
            {
                stage.entry.trackTime = 0;

                spine.state.clearTrack(trackIndex);
                spine.skeleton.setToSetupPose();
                spine.update(0);

                applyActivation(stage.action, true);
                stages.delete(trackIndex);
            }
            else
            {
                stage.entry.trackTime = stage.targetTime;
                stage.entry.timeScale = 0;

                spine.update(0);
            }
        }

        if (stages.size === 0)
            stopTracking();
    }

    function playStaged(action: ParsedSpineTap): boolean {
        const points = action.clicks!;
        const trackIndex = action.trackIndex;
        let stage = stages.get(trackIndex);

        if (stage && spine.state.getCurrent(trackIndex) !== stage.entry)
        {
            stages.delete(trackIndex);
            stage = undefined;
        }

        if (stage)
        {
            if (stage.action !== action || stage.entry.timeScale !== 0)
                return false;

            const step = stage.step + 1;
            if (step >= points.length)
                return false;

            stage.step = step;
            stage.targetTime = points[step] * stage.duration;
            stage.entry.timeScale = points[step] === 0 ? -1 : 1;

            applyActivation(action, step % 2 === 1)
            return true;
        }

        const animationName = action.animationNames[0];
        const duration = spine.skeleton.data.findAnimation(animationName)!.duration;
        const entry = spine.state.setAnimation(trackIndex, animationName, false);

        entry.timeScale = 1;
        stages.set(trackIndex, {
            entry,
            action,
            duration,
            step: 0,
            targetTime: points[0] * duration
        });

        applyActivation(action, false);

        if (!tracking)
        {
            spine.ticker.add(updateStages, undefined, UPDATE_PRIORITY.NORMAL - 1);
            tracking = true;
        }

        return true;
    }

    function chooseAnimation(action: ParsedSpineTap): string | undefined {
        if (action.orderActions)
        {
            const position = orderPositions.get(action.item.index) ?? 0;
            orderPositions.set(action.item.index, (position + 1) % action.orderActions.length);

            return action.orderActions[position];
        }

        if (action.randomActions)
        {
            const total = action.randomActions.reduce((sum, choice) => sum + choice.weight, 0);
            let pick = Math.random() * total;

            for (const choice of action.randomActions)
            {
                pick -= choice.weight;
                if (pick < 0)
                    return choice.animation;
            }

            return action.randomActions.at(-1)!.animation;
        }

        return action.animationNames[0];
    }

    function trackOf(item: SpineActionItem): number {
        if (item.sType < 6)
            return 1;

        const override = item.content?.trackIndex;
        return typeof override === "number" ? override : item.index;
    }

    function scheduleIdle(action: ParsedSpineTap) {
        if (!action.changeIdle)
            return;
        if (idleTimer !== undefined)
            clearTimeout(idleTimer);

        const { animation, delayMs, ignoredItems } = action.changeIdle;

        idleTimer = setTimeout(() => {
            idleTimer = undefined;
            if (destroyed)
                return;

            const ignoredTracks = new Set([action.trackIndex]);

            for (const index of ignoredItems)
            {
                const item = interaction.items.find((candidate) => candidate.index === index);
                if (item)
                    ignoredTracks.add(trackOf(item));
            }

            for (const item of interaction.items)
            {
                const trackIndex = trackOf(item);
                if (ignoredTracks.has(trackIndex))
                    continue;

                spine.state.clearTrack(trackIndex);
                spine.skeleton.setToSetupPose();

                stages.delete(trackIndex);
                orderPositions.delete(item.index);
            }

            if (stages.size === 0)
                stopTracking();

            spine.state.setAnimation(0, animation, true);
            spine.update(0);
        }, delayMs);
    }

    for (const action of actions)
    {
        const [x, y, width, height, angle] = action.area;
        const hitbox = new Container();

        hitbox.position.set(x, -y);
        hitbox.rotation = -angle * Math.PI / 180;
        hitbox.hitArea = new Rectangle(-width / 2, -height / 2, width, height);
        hitbox.eventMode = "static";
        hitbox.cursor = "pointer";

        const outline = new Graphics()
            .rect(-width / 2, -height / 2, width, height)
            .stroke({ color: 0xc7aa83, width: 2 });

        outline.eventMode = "none";
        outline.visible = showHotspots;

        outlines.push(outline);
        hitbox.addChild(outline);
        hitboxes.set(action.item.index, hitbox);

        setActive(action.item.index, !action.initiallyHidden);

        hitbox.on("pointertap", () => {
            const now = performance.now();
            if (destroyed || now < nextTapAt || !hitbox.visible)
                return;

            if (action.item.sType === 2 && spine.state.getCurrent(1))
                return;

            if (action.clicks)
            {
                if (!playStaged(action))
                    return;
            }
            else
            {
                const animationName = chooseAnimation(action);
                stages.delete(action.trackIndex);

                if (action.item.sType === 2 && animationName)
                {
                    spine.state.setEmptyAnimation(1, 0);
                    const entry = spine.state.addAnimation(1, animationName, false, 0);
                    entry.mixDuration = 0.2;
                    spine.state.addEmptyAnimation(1, 0.5, 0);
                }
                else if (animationName)
                {
                    spine.state.setAnimation(action.trackIndex, animationName, false);
                }

                applyActivation(action, false);
                scheduleIdle(action);
            }

            nextTapAt = now + 500;
        });

        layer.addChild(hitbox);
    }

    return {
        setDebugVisible(visible: boolean) {
            for (const outline of outlines)
                outline.visible = visible;
        },
        destroy() {
            destroyed = true;

            if (idleTimer !== undefined)
                clearTimeout(idleTimer);

            stopTracking();
            stages.clear();
            hitboxes.clear();
            outlines.length = 0;
        }
    }
}
