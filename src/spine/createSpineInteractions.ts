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
    clickTimeRemaining?: number;
}

interface StoppedAction {
    entry: TrackEntry;
    stopAt: number;
    stopLimit: number;
    stopTime: number;
    remainingResets: number;
    pendingStop: boolean;
    pausedFor: number;
}

export function createSpineInteractions(layer: Container, spine: Spine, interaction: SpineActionConfig, showHotspots: boolean) {
    const itemsByIndex = new Map(interaction.items.map((item) => [item.index, item]));
    const parsed = interaction.items.map((item) => parseSpineTap(item, spine)).filter((action): action is ParsedSpineTap => action !== undefined);
    const actionsByIndex = new Map(parsed.map((action) => [action.item.index, action]));
    let priorSize: number;

    do
    {
        priorSize = actionsByIndex.size;

        for (const action of actionsByIndex.values())
        {
            if (action.nextClick && !actionsByIndex.has(action.nextClick))
                actionsByIndex.delete(action.item.index);
        }
    } while (actionsByIndex.size !== priorSize);

    const actions = [...actionsByIndex.values()];
    const hitboxes = new Map<number, Container>();
    const outlines: Graphics[] = [];
    const stages = new Map<number, StagedTap>();
    const stoppedActions = new Map<number, StoppedAction>();
    const orderPositions = new Map<number, number>();
    const clickCounts = new Map<number, number>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let tracking = false;
    let destroyed = false;
    let nextTapAt = 0;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    function stopTracking() {
        if (!tracking)
            return;

        spine.ticker.remove(updatePlayback);
        tracking = false;
    }

    function ensureTracking() {
        if (tracking)
            return;

        spine.ticker.add(updatePlayback, undefined, UPDATE_PRIORITY.NORMAL - 1);
        tracking = true;
    }

    function maybeStopTracking() {
        if (stages.size === 0 && stoppedActions.size === 0)
            stopTracking();
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

    function updatePlayback() {
        const deltaSeconds = Math.max(0, spine.ticker.deltaMS / 1000);

        for (const [trackIndex, stage] of stages)
        {
            if (spine.state.getCurrent(trackIndex) !== stage.entry)
            {
                stages.delete(trackIndex);
                continue;
            }

            if (stage.entry.timeScale === 0)
            {
                if (stage.clickTimeRemaining !== undefined && stage.targetTime > 0)
                {
                    stage.clickTimeRemaining -= deltaSeconds;

                    if (stage.clickTimeRemaining <= 0)
                    {
                        stage.clickTimeRemaining = undefined;
                        stage.step = stage.action.clicks!.length - 1;
                        stage.targetTime = 0;
                        stage.entry.timeScale = -1;
                    }
                }

                continue;
            }

            const reached = stage.entry.timeScale > 0
                ? stage.entry.trackTime >= stage.targetTime
                : stage.entry.trackTime <= stage.targetTime;

            if (!reached)
                continue;

            if (stage.step === stage.action.clicks!.length - 1)
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

        for (const [trackIndex, stopped] of stoppedActions)
        {
            if (spine.state.getCurrent(trackIndex) !== stopped.entry)
            {
                stoppedActions.delete(trackIndex);
                continue;
            }

            if (stopped.pendingStop && stopped.entry.trackTime >= stopped.stopAt)
            {
                stopped.entry.trackTime = stopped.stopAt;
                stopped.entry.timeScale = 0;
                stopped.pendingStop = false;
                stopped.pausedFor = 0;

                spine.update(0);
            }
            else if (stopped.entry.timeScale === 0)
            {
                stopped.pausedFor += deltaSeconds;

                if (stopped.pausedFor > stopped.stopTime)
                    stopped.entry.timeScale = 1;
            }
        }

        maybeStopTracking();
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
            const prior = stage.action;
            if (
                stage.entry.timeScale !== 0 ||
                prior.animationNames[0] !== action.animationNames[0] ||
                prior.clicks!.length !== points.length ||
                !prior.clicks!.every((point, index) => point === points[index])
            )
            {
                return false;
            }

            const step = stage.step + 1;
            if (step >= points.length)
                return false;

            stage.action = action;
            stage.step = step;
            stage.targetTime = points[step] * stage.duration;
            stage.clickTimeRemaining = action.clickTime;
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
            targetTime: points[0] * duration,
            clickTimeRemaining: action.clickTime
        });

        applyActivation(action, false);
        ensureTracking();

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

    function isIdle(): boolean {
        return spine.state.getCurrent(1) === null;
    }

    function canTrigger(action: ParsedSpineTap): boolean {
        if (action.conditions)
        {
            const target = itemsByIndex.get(action.conditions.itemIndex);
            if (!target)
                return false;

            const entry = spine.state.getCurrent(trackOf(target));
            const progress = entry && (entry.animation?.duration ?? 0) > 0
                ? entry.trackTime / entry.animation!.duration
                : 0;

            const { minimum, maximum } = action.conditions;

            if (maximum === undefined)
            {
                if (minimum === 0 ? entry !== null : entry === null || progress < minimum)
                    return false;
            }
            else if (progress < minimum || progress > maximum)
            {
                return false;
            }
        }

        if (action.trackIndex === 1)
        {
            if (!action.actions && !isIdle())
                return false;

            for (const index of action.noClick ?? [])
            {
                const target = itemsByIndex.get(index);
                if (!target)
                    return false;

                const entry = spine.state.getCurrent(trackOf(target));
                if (entry && entry.trackTime !== 0)
                    return false;
            }
        }
        else if (action.guochange)
        {
            const entry = spine.state.getCurrent(action.trackIndex);
            if (!isIdle() || (entry && entry.trackTime < (entry.animation?.duration ?? 0)))
                return false;
        }
        else if (action.needIdle && !isIdle())
        {
            return false;
        }

        return (action.needClicks ?? []).every((index) => (clickCounts.get(index) ?? 0) > 0);
    }

    function resetTracks(action: ParsedSpineTap) {
        for (const index of action.reset7 ?? [])
        {
            const target = itemsByIndex.get(index);
            if (!target)
                continue;

            const trackIndex = trackOf(target);
            spine.state.setEmptyAnimation(trackIndex, 0.2);

            stages.delete(trackIndex);
            stoppedActions.delete(trackIndex);
            orderPositions.delete(index);
        }

        maybeStopTracking();
    }

    function trackOf(item: SpineActionItem): number {
        if (item.sType < 6)
            return 1;

        const override = item.content?.trackIndex;
        const index = typeof override === "number" || typeof override === "string" ? Number(override) : NaN;

        return Number.isInteger(index) && index > 0 ? index : item.index;
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
                const item = itemsByIndex.get(index);
                if (item)
                    ignoredTracks.add(trackOf(item));
            }

            for (const item of interaction.items)
            {
                const trackIndex = trackOf(item);
                if (ignoredTracks.has(trackIndex))
                    continue;

                spine.state.clearTrack(trackIndex);

                stages.delete(trackIndex);
                stoppedActions.delete(trackIndex);
                orderPositions.delete(item.index);
            }

            maybeStopTracking();

            spine.skeleton.setToSetupPose();
            spine.state.setAnimation(0, animation, true);
            spine.update(0);
        }, delayMs);
    }

    function queueNext(action: ParsedSpineTap, entry?: TrackEntry) {
        if (!action.nextClick)
            return;

        const target = actionsByIndex.get(action.nextClick);
        if (!target)
            return;

        const continueToNext = () => {
            if (destroyed)
                return;

            if (isIdle())
            {
                trigger(target);
                return;
            }

            const timer = setTimeout(() => {
                timers.delete(timer);

                if (destroyed)
                    return;

                if (!isIdle())
                {
                    spine.state.clearTrack(action.trackIndex);
                    spine.update(0);
                }

                trigger(target);
            }, 501);

            timers.add(timer);
        };

        if (!entry)
        {
            continueToNext();
            return;
        }

        let completed = false;

        entry.listener = {
            complete: () => {
                if (completed)
                    return;

                completed = true;
                continueToNext();
            }
        };
    }

    function playActions(action: ParsedSpineTap) {
        const rule = action.actions!;
        const name = action.animationNames[0];
        const current = spine.state.getCurrent(1);

        if (current?.animation?.name === name)
        {
            const stopped = stoppedActions.get(1);

            if (
                stopped?.entry === current &&
                stopped.remainingResets > 0 &&
                current.trackTime >= stopped.stopAt &&
                current.trackTime <= stopped.stopLimit
            )
            {
                stopped.remainingResets--;
                current.trackTime = stopped.stopAt;
                current.timeScale = 1;

                spine.update(0);
            }

            return;
        }

        if (current)
            return;

        const entry = spine.state.setAnimation(1, name, false);

        entry.mixDuration = 0.2;
        spine.state.addEmptyAnimation(1, 0.5, 0);

        const duration = spine.skeleton.data.findAnimation(name)!.duration;

        stoppedActions.set(1, {
            entry,
            stopAt: rule.stopPerc * duration,
            stopLimit: rule.stopLimit * duration,
            stopTime: rule.stopTime,
            remainingResets: rule.stopCount,
            pendingStop: true,
            pausedFor: 0
        });

        ensureTracking();
    }

    function trigger(action: ParsedSpineTap, fromPointer = false): boolean {
        const now = performance.now();
        if (destroyed || (fromPointer && now < nextTapAt) || !canTrigger(action))
            return false;

        resetTracks(action);

        if (action.clicks)
        {
            if (!playStaged(action))
                return false;
        }
        else if (action.actions)
        {
            playActions(action);
        }
        else
        {
            const animationName = chooseAnimation(action);
            stages.delete(action.trackIndex);

            let entry: TrackEntry | undefined;

            if (action.trackIndex === 1 && animationName)
            {
                spine.state.setEmptyAnimation(1, 0);
                entry = spine.state.addAnimation(1, animationName, false, 0);
                entry.mixDuration = action.noFade ? 0 : 0.2;

                if (action.noFade)
                    entry.alpha = 1;

                spine.state.addEmptyAnimation(1, 0.5, 0);
            }
            else if (animationName)
            {
                entry = spine.state.setAnimation(action.trackIndex, animationName, false);
                if (action.guochange)
                    spine.state.addEmptyAnimation(action.trackIndex, 0.5, 0);
            }

            applyActivation(action, false);
            scheduleIdle(action);
            queueNext(action, entry);
        }

        clickCounts.set(action.item.index, (clickCounts.get(action.item.index) ?? 0) + 1);

        if (fromPointer)
            nextTapAt = now + 500;

        return true;
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
            if (hitbox.visible)
                trigger(action, true);
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

            for (const timer of timers)
                clearTimeout(timer);

            timers.clear();

            stopTracking();

            stages.clear();
            stoppedActions.clear();
            hitboxes.clear();
            outlines.length = 0;
        }
    }
}
