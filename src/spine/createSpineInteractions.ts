import type { SpineActionConfig, SpineActionItem } from "@/types/spine";

import { parseSpineTap, type ParsedSpineTap, type SpineRoleTransition } from "./parseSpineTap";
import { attachSpineGesture, attachSpineObjectDrag, type SpineObjectDragScene } from "./attachSpineGesture";
import { bindSpineSlotHotspots, type SpineSlotHotspot } from "./bindSpineSlotHotspots";
import { prepareIdleTransitionAnimation } from "./prepareIdleTransitionAnimation";
import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { Container, Graphics, Rectangle, UPDATE_PRIORITY } from "pixi.js";

type TrackEntry = ReturnType<Spine["state"]["setAnimation"]>;

interface StagedTap {
    entry: TrackEntry;
    action: ParsedSpineTap;
    duration: number;
    step: number;
    targetTime: number;
    progress: number;
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

interface SpineInteractionOptions {
    role?: number;
    state?: SpineInteractionState;
    scene?: SpineObjectDragScene;
    canTransition?: (transition: SpineRoleTransition) => boolean;
    onTransition?: (transition: SpineRoleTransition, entry?: TrackEntry) => void;
    onSpineUI?: () => void;
    onActionStart?: (item: SpineActionItem, recordPosition?: number) => void;
    onAsmr?: (id: number) => void;
    onHotspotPointer?: () => void;
}

export interface SpineInteractionState {
    clickCounts: Map<number, number>;
    orderPositions: Map<number, number>;
    stageSteps: Map<number, number>;
}

export function createSpineInteractionState(): SpineInteractionState {
    return { clickCounts: new Map(), orderPositions: new Map(), stageSteps: new Map() };
}

export function createSpineInteractions(
    layer: Container,
    spine: Spine,
    interaction: SpineActionConfig,
    showHotspots: boolean,
    options: SpineInteractionOptions = {}
) {
    const itemsByIndex = new Map(interaction.items.map((item) => [item.index, item]));
    const parsed = interaction.items.map((item) => parseSpineTap(item, spine, options.role))
        .filter((action): action is ParsedSpineTap => action !== undefined)
        .filter((action) => !action.drag || options.scene !== undefined)
        .filter((action) => !action.spineUI || options.onSpineUI !== undefined)
        .filter((action) => action.asmrId === undefined || options.onAsmr !== undefined)
        .filter((action) => !action.changeRole || options.canTransition?.(action.changeRole) === true);
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
    const fadingEntries = new Map<number, TrackEntry>();
    const state = options.state ?? createSpineInteractionState();
    const { orderPositions, clickCounts, stageSteps } = state;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const disposeGestures: Array<() => void> = [];
    const slotHotspots: SpineSlotHotspot[] = [];
    const slotNames: Record<number, string> = interaction.id === 7031003
        ? { 8: "ui1", 12: "ui2" }
        : {};
    const recoveringGestureTracks = new Set<number>();
    let tracking = false;
    let destroyed = false;
    let enabled = true;
    let nextTapAt = 0;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let gestureActive = false;

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
        if (stages.size === 0 && stoppedActions.size === 0 && fadingEntries.size === 0)
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
                stageSteps.delete(trackIndex);
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
                spine.state.setEmptyAnimation(trackIndex, 0.5);

                applyActivation(stage.action, true);
                stages.delete(trackIndex);
                stageSteps.delete(trackIndex);
            }
            else
            {
                stage.entry.timeScale = 0;
            }
        }

        for (const [trackIndex, stopped] of stoppedActions)
        {
            if (spine.state.getCurrent(trackIndex) !== stopped.entry)
            {
                stoppedActions.delete(trackIndex);
                continue;
            }

            if (stopped.entry.alpha < 1)
                stopped.entry.alpha = Math.min(1, stopped.entry.alpha + deltaSeconds / 0.2);

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

        for (const [trackIndex, entry] of fadingEntries)
        {
            if (spine.state.getCurrent(trackIndex) !== entry)
            {
                fadingEntries.delete(trackIndex);
                continue;
            }

            entry.alpha = Math.min(1, entry.alpha + deltaSeconds / 0.2);

            if (entry.alpha === 1)
                fadingEntries.delete(trackIndex);
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
            stageSteps.set(trackIndex, step + 1);
            stage.targetTime = points[step] * stage.duration;
            stage.progress = points[step];
            stage.clickTimeRemaining = action.clickTime;
            stage.entry.timeScale = points[step] === 0 ? -1 : 1;

            applyActivation(action, step % 2 === 1)
            options.onActionStart?.(action.item, step + 1);

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
            progress: points[0],
            clickTimeRemaining: action.clickTime
        });
        stageSteps.set(trackIndex, 1);
        options.onActionStart?.(action.item, 1);

        applyActivation(action, false);
        ensureTracking();

        return true;
    }

    function chooseAnimation(action: ParsedSpineTap): { name: string; position: number } | undefined {
        if (action.orderActions)
        {
            const position = orderPositions.get(action.item.index) ?? 0;
            orderPositions.set(action.item.index, (position + 1) % action.orderActions.length);

            return { name: action.orderActions[position], position: position + 1 };
        }

        if (action.randomActions)
        {
            const total = action.randomActions.reduce((sum, choice) => sum + choice.weight, 0);
            let pick = Math.random() * total;

            for (const [index, choice] of action.randomActions.entries())
            {
                pick -= choice.weight;
                if (pick < 0)
                    return { name: choice.animation, position: index + 1 };
            }

            return { name: action.randomActions.at(-1)!.animation, position: action.randomActions.length };
        }

        const name = action.animationNames[0];
        return name ? { name, position: 1 } : undefined;
    }

    function isIdle(): boolean {
        return spine.state.getCurrent(1) === null;
    }

    function canTrigger(action: ParsedSpineTap, forced = false): boolean {
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

        if (forced)
            return (action.needClicks ?? []).every((index) => (clickCounts.get(index) ?? 0) > 0);

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
            stageSteps.delete(trackIndex);
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
                stageSteps.delete(trackIndex);
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
        entry.alpha = 0;
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
        options.onActionStart?.(action.item, 1);
    }

    function playDragAnimation(action: ParsedSpineTap, name: string) {
        const trackIndex = action.trackIndex;
        const entry = spine.state.setAnimation(trackIndex, name, false);
        entry.alpha = 0;
        entry.mixDuration = 0.2;

        spine.state.addEmptyAnimation(trackIndex, 0.5, 0);
        fadingEntries.set(trackIndex, entry);
        ensureTracking();
        options.onActionStart?.(action.item, 1);
    }

    function trigger(action: ParsedSpineTap, fromPointer = false, forced = false, fromObjectRestore = false, onComplete?: () => void): boolean {
        if (action.gesture || (action.drag && !fromObjectRestore))
            return false;

        if (action.asmrId !== undefined)
        {
            if (!fromPointer || destroyed || !enabled || gestureActive)
                return false;

            options.onAsmr?.(action.asmrId);
            return true;
        }

        const now = performance.now();
        if (destroyed || !enabled || (fromPointer && now < nextTapAt) || !canTrigger(action, forced))
            return false;

        if (action.drag)
        {
            const name = action.animationNames[0];
            if (name)
                playDragAnimation(action, name);

            clickCounts.set(action.item.index, (clickCounts.get(action.item.index) ?? 0) + 1);

            if (fromPointer)
                nextTapAt = now + 500;

            return true;
        }

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
            const chosen = chooseAnimation(action);
            const animationName = chosen?.name;

            stages.delete(action.trackIndex);
            stageSteps.delete(action.trackIndex);

            let entry: TrackEntry | undefined;

            if (action.trackIndex === 1 && animationName)
            {
                const animation = spine.skeleton.data.findAnimation(animationName)!;
                const playback = action.changeIdle
                    ? prepareIdleTransitionAnimation(animation)
                    : animation;

                spine.state.setEmptyAnimation(1, 0);

                entry = spine.state.addAnimationWith(1, playback, false, 0);
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

            if (entry)
                options.onActionStart?.(action.item, chosen?.position ?? 1);

            applyActivation(action, false);
            scheduleIdle(action);

            if (action.changeRole)
                options.onTransition?.(action.changeRole, entry);
            else
                queueNext(action, entry);

            if (entry && onComplete)
            {
                const previous = entry.listener;
                let completed = false;

                entry.listener = {
                    ...previous,
                    complete: (finished) => {
                        previous?.complete?.(finished);

                        if (!destroyed && !completed)
                        {
                            completed = true;
                            onComplete();
                        }
                    }
                };
            }
        }

        clickCounts.set(action.item.index, (clickCounts.get(action.item.index) ?? 0) + 1);

        if (fromPointer)
            nextTapAt = now + 500;

        return true;
    }

    for (const action of actions)
    {
        if (!action.area || action.area[2] <= 0 || action.area[3] <= 0)
            continue;

        const [x, y, width, height, angle] = action.area;
        const hitbox = new Container();

        hitbox.position.set(x, -y);
        hitbox.rotation = -angle * Math.PI / 180;
        hitbox.hitArea = new Rectangle(-width / 2, -height / 2, width, height);
        hitbox.eventMode = "static";
        hitbox.cursor = action.gesture || action.drag ? "grab" : "pointer";

        const outline = new Graphics()
            .rect(-width / 2, -height / 2, width, height)
            .stroke({ color: 0xc7aa83, width: 2 });

        outline.eventMode = "none";
        outline.visible = showHotspots;

        outlines.push(outline);
        hitbox.addChild(outline);

        const slotName = slotNames[action.item.index];
        if (slotName)
            slotHotspots.push({ slotName, hitbox, outline });

        hitbox.on("pointerdown", () => options.onHotspotPointer?.());
        hitboxes.set(action.item.index, hitbox);

        setActive(action.item.index, !action.initiallyHidden);

        if (action.drag && options.scene)
        {
            disposeGestures.push(attachSpineObjectDrag(
                hitbox,
                spine,
                action,
                options.scene,
                () => enabled && !destroyed && !gestureActive && hitbox.visible && isIdle(),
                () => {
                    gestureActive = true;
                    options.onActionStart?.(action.item, 1);
                    clickCounts.set(action.item.index, (clickCounts.get(action.item.index) ?? 0) + 1);
                },
                () => { gestureActive = false },
                (animation) => playDragAnimation(action, animation),
                () => { trigger(action, true, false, true); }
            ));
        }
        else if (action.gesture)
        {
            disposeGestures.push(attachSpineGesture(
                hitbox,
                spine,
                action,
                () => enabled && !destroyed && !gestureActive && hitbox.visible && isIdle() && !recoveringGestureTracks.has(action.trackIndex),
                () => {
                    gestureActive = true;
                    options.onActionStart?.(action.item, 1);
                    clickCounts.set(action.item.index, (clickCounts.get(action.item.index) ?? 0) + 1);
                },
                () => { gestureActive = false; },
                (recovering) => {
                    if (recovering)
                        recoveringGestureTracks.add(action.trackIndex);
                    else
                        recoveringGestureTracks.delete(action.trackIndex);
                }
            ));
        }
        else
        {
            hitbox.on("pointertap", () => {
                if (hitbox.visible)
                    trigger(action, true);
            });
        }

        layer.addChild(hitbox);
    }

    if (slotHotspots.length > 0)
        disposeGestures.push(bindSpineSlotHotspots(layer, spine, slotHotspots));

    for (const action of actions)
    {
        if (!action.clicks)
            continue;

        const trackIndex = action.trackIndex;
        const count = stageSteps.get(trackIndex);

        if (!count || stages.has(trackIndex) || count > action.clicks.length)
            continue;

        const name = action.animationNames[0];
        const duration = spine.skeleton.data.findAnimation(name)!.duration;
        const entry = spine.state.setAnimation(trackIndex, name, false);
        const targetTime = action.clicks[count - 1] * duration;

        entry.trackTime = targetTime;
        entry.timeScale = 0;

        stages.set(trackIndex, {
            entry, action, duration, step: count - 1, targetTime,
            progress: action.clicks[count - 1],
            clickTimeRemaining: action.clickTime
        });

        ensureTracking();
    }

    const eventListener: Parameters<Spine["state"]["addListener"]>[0] = {
        event: (_entry, event) => {
            if (event.data.name === "SpineUI" || event.data.name.startsWith("SpineUI_"))
            {
                options.onSpineUI?.();
                return;
            }

            const match = /^TriggerIndex_(\d+)$/.exec(event.data.name);
            if (!match)
                return;

            const action = actionsByIndex.get(Number(match[1]));
            if (action)
                trigger(action, false, true);
        }
    };

    spine.state.addListener(eventListener);

    return {
        isIdle,
        getStagedAction(index: number) {
            if (destroyed)
                return undefined;

            const action = actionsByIndex.get(index);
            const stage = action && stages.get(action.trackIndex);

            if (!stage || spine.state.getCurrent(action.trackIndex) !== stage.entry)
                return undefined;

            return { progress: stage.progress, playing: stage.entry.timeScale !== 0 };
        },
        triggerByIndex(index: number, forced = false, onComplete?: () => void) {
            const action = actionsByIndex.get(index);
            return action ? trigger(action, false, forced, false, onComplete) : false;
        },
        setEnabled(value: boolean) {
            enabled = value;
        },
        setDebugVisible(visible: boolean) {
            for (const outline of outlines)
                outline.visible = visible;
        },
        destroy() {
            destroyed = true;

            spine.state.removeListener(eventListener);

            for (const dispose of disposeGestures)
                dispose();

            if (idleTimer !== undefined)
                clearTimeout(idleTimer);

            for (const timer of timers)
                clearTimeout(timer);

            timers.clear();

            stopTracking();

            stages.clear();
            fadingEntries.clear();
            stoppedActions.clear();
            hitboxes.clear();
            recoveringGestureTracks.clear();
            outlines.length = 0;
            disposeGestures.length = 0;
        }
    }
}
