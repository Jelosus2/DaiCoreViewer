import type { ParsedSpineTap } from "./parseSpineTap";

import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { Container, UPDATE_PRIORITY, type FederatedPointerEvent } from "pixi.js";

type TrackEntry = ReturnType<Spine["state"]["setAnimation"]>;

interface ActivePointer {
    id: number;
    x: number;
    y: number;
    started: boolean;
}

interface Recovery {
    entry: TrackEntry;
    wait: number;
    forward: boolean;
}

export function attachSpineGesture(
    hitbox: Container,
    spine: Spine,
    action: ParsedSpineTap,
    canBegin: () => boolean,
    onBegin: () => void,
    onEnd: () => void,
    onRecoveryChange: (recovering: boolean) => void
): () => void {
    const gesture = action.gesture!;
    const trackIndex = action.trackIndex;
    const name = action.animationNames[0];
    const duration = spine.skeleton.data.findAnimation(name)!.duration;
    const ticker = spine.ticker;

    let pointer: ActivePointer | undefined;
    let recovery: Recovery | undefined;
    let tracking = false;

    function stopRecovery() {
        if (!recovery)
            return;

        recovery = undefined;
        onRecoveryChange(false);

        if (tracking)
        {
            ticker.remove(updateRecovery);
            tracking = false;
        }
    }

    function updateRecovery() {
        const current = recovery;
        if (!current)
            return;

        if (spine.state.getCurrent(trackIndex) !== current.entry)
        {
            stopRecovery();
            return;
        }

        const seconds = Math.max(0, ticker.deltaMS / 1000);

        // The game's reverse recovery fades the main track during its wait.
        if (trackIndex === 1 && !current.forward)
            current.entry.alpha = Math.max(0, current.entry.alpha - seconds / 0.2);

        current.wait = Math.max(0, current.wait - seconds);
        if (current.wait > 0)
            return;

        if (current.entry.timeScale === 0)
            current.entry.timeScale = current.forward ? 1 : -1;

        const finished = current.forward
            ? current.entry.trackTime >= duration
            : current.entry.trackTime <= 0;

        if (!finished)
            return;

        if (trackIndex === 1)
        {
            if (current.forward)
            {
                spine.state.setEmptyAnimation(trackIndex, 0.5);
            }
            else
            {
                spine.state.clearTrack(trackIndex);
                spine.skeleton.setToSetupPose();
            }
        }
        else
        {
            current.entry.trackTime = 0;
            current.entry.timeScale = 0;
        }

        stopRecovery();
        spine.update(0);
    }

    function onPointerDown(event: FederatedPointerEvent) {
        if (pointer || recovery || !canBegin())
            return;

        pointer = {
            id: event.pointerId,
            x: event.global.x,
            y: event.global.y,
            started: false
        };
    }

    function onPointerMove(event: FederatedPointerEvent) {
        const current = pointer;
        if (!current || current.id !== event.pointerId)
            return;

        const deltaX = event.global.x - current.x;
        const deltaY = current.y - event.global.y; // Unity screen Y points upward.

        if (deltaX === 0 && deltaY === 0)
            return;

        if (!current.started)
        {
            if (!canBegin())
            {
                pointer = undefined;
                return;
            }

            current.started = true;
            onBegin();
        }

        current.x = event.global.x;
        current.y = event.global.y;

        let entry = spine.state.getCurrent(trackIndex);
        if (entry?.animation?.name !== name || entry.timeScale !== 0)
        {
            entry = spine.state.setAnimation(trackIndex, name, false);
            entry.mixDuration = 0.2;
            entry.timeScale = 0;
            entry.alpha = 1;
        }

        const movement = gesture.direction === 1 ? -deltaX
            : gesture.direction === 2 ? deltaX
            : gesture.direction === 3 ? deltaY
            : -deltaY;

        const progress = entry.trackTime / duration;
        const next = Math.max(0, Math.min(gesture.limit, progress + movement * gesture.speed * 0.001));

        entry.trackTime = next * duration;
        spine.update(0);
    }

    function onPointerUp(event: FederatedPointerEvent) {
        const current = pointer;
        if (!current || current.id !== event.pointerId)
            return;

        pointer = undefined;
        if (!current.started)
            return;

        onEnd();

        if (gesture.stopTime === undefined)
            return;

        const entry = spine.state.getCurrent(trackIndex);
        if (!entry || entry.animation?.name !== name)
            return;

        const progress = entry.trackTime / duration;
        recovery = {
            entry,
            wait: gesture.stopTime,
            forward: gesture.split !== 1 && gesture.split - progress < 0.01
        };

        if (trackIndex === 1)
            spine.state.addEmptyAnimation(trackIndex, 0.5, 0);

        onRecoveryChange(true);
        ticker.add(updateRecovery, undefined, UPDATE_PRIORITY.NORMAL - 1);

        tracking = true;
    }

    hitbox.on("pointerdown", onPointerDown);
    hitbox.on("globalpointermove", onPointerMove);
    hitbox.on("pointerup", onPointerUp);
    hitbox.on("pointerupoutside", onPointerUp);
    hitbox.on("pointercancel", onPointerUp);

    return () => {
        hitbox.off("pointerdown", onPointerDown);
        hitbox.off("globalpointermove", onPointerMove);
        hitbox.off("pointerup", onPointerUp);
        hitbox.off("pointerupoutside", onPointerUp);
        hitbox.off("pointercancel", onPointerUp);

        if (pointer?.started)
            onEnd();

        pointer = undefined;
        stopRecovery();
    };
}
