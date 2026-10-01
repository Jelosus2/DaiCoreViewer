import type { ParsedSpineTap } from "./parseSpineTap";
import type { BuiltSpineScene } from "./buildSpineScene";
import type { SpineRoot } from "@/types/spine";

import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { Container, Rectangle, UPDATE_PRIORITY, type FederatedPointerEvent } from "pixi.js";

type TrackEntry = ReturnType<Spine["state"]["setAnimation"]>;

export type SpineObjectDragScene = BuiltSpineScene & {
    root: SpineRoot;
    getGamePortraitScale: () => number;
};

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

interface Pointer {
    id: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    started: boolean;
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

export function attachSpineObjectDrag(
    hitbox: Container,
    spine: Spine,
    action: ParsedSpineTap,
    scene: SpineObjectDragScene,
    canBegin: () => boolean,
    onBegin: () => void,
    onEnd: () => void,
    onDrop: (animation: string) => void,
    onRestore: () => void
): () => void {
    const drag = action.drag!;

    function nodeAt(path: string): number {
        let parent = 0;

        for (const part of path.split("/"))
        {
            const index = scene.root.nodes.findIndex((node) => node.parent === parent && node.name === part);
            if (index < 0)
                throw new Error(`Missing drag prefab node: ${path}`);

            parent = index;
        }

        return parent;
    }

    const objectIndex = nodeAt(`pos/${drag.targetObjName}`);
    const object = scene.nodes[objectIndex];
    const source = scene.root.nodes[objectIndex];

    if (!source.image && !source.mask)
        throw new Error(`Drag image was not exported for ${drag.targetObjName}`);

    const targets = drag.targets.map((target) => {
        const index = nodeAt(`pos/${target.object}`);
        const transform = scene.root.nodes[index].transform;
        const size = transform.sizeDelta;

        if (!size || size.some((value) => !Number.isFinite(value) || value <= 0))
            throw new Error(`Missing or invalid drop target size: ${target.object}`);

        const [width, height] = size;
        const [pivotX, pivotY] = transform.pivot ?? [0.5, 0.5];

        return {
            node: scene.nodes[index],
            animation: target.animation,
            bounds: new Rectangle(-pivotX * width, -(1 - pivotY) * height, width, height)
        };
    });

    const overlayIndex = drag.hideSpine
        ? nodeAt(`pos/${drag.hideSpine}`)
        : undefined;

    const overlay = overlayIndex === undefined
        ? undefined
        : scene.nodes[overlayIndex];

    const overlaySpine = drag.hideSpine
        ? scene.spines.find((candidate) => scene.spineNodes.get(candidate) === nodeAt(`pos/${drag.hideSpine}/pos/main`))
        : undefined;

    const origin = { x: object.position.x, y: object.position.y };

    const overlayOrigin = overlay
        ? { x: overlay.position.x, y: overlay.position.y }
        : undefined;

    const hiddenSlots: Array<{ slot: { color: { a: number } }; alpha: number }> = [];

    let pointer: Pointer | undefined;
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    let fixedOverlay: { x: number; y: number } | undefined;
    let restoreOnTap = false;
    let lastDragEndAt = 0;

    function clearHold() {
        if (holdTimer !== undefined)
            clearTimeout(holdTimer);

        holdTimer = undefined;
    }

    function restoreSlots() {
        for (const { slot, alpha } of hiddenSlots)
            slot.color.a = alpha;

        hiddenSlots.length = 0;
    }

    function resetObject() {
        object.position.set(origin.x, origin.y);
        object.visible = false;

        if (overlay && overlayOrigin)
            overlay.position.set(overlayOrigin.x, overlayOrigin.y);

        fixedOverlay = undefined;
    }

    function moveObject(x: number, y: number) {
        const local = object.parent!.toLocal({ x, y });
        object.position.set(local.x, local.y);

        if (overlay && fixedOverlay)
        {
            const global = scene.nodes[0].toGlobal(fixedOverlay);
            const stable = overlay.parent!.toLocal(global);

            overlay.position.set(stable.x, stable.y);
        }
    }

    function begin() {
        const current = pointer;
        if (!current || current.started || !canBegin())
            return;

        clearHold();

        current.started = true;
        fixedOverlay = overlay
            ? scene.nodes[0].toLocal(overlay.getGlobalPosition())
            : undefined;

        const mainIdle = spine.state.getCurrent(0);
        const secondIdle = overlaySpine?.state.getCurrent(0);

        if (mainIdle && secondIdle)
        {
            secondIdle.trackTime = mainIdle.trackTime;
            overlaySpine!.update(0);
        }

        object.visible = true;

        for (const name of drag.slots)
        {
            const slot = spine.skeleton.findSlot(name);
            if (!slot)
                continue;

            hiddenSlots.push({ slot, alpha: slot.color.a });
            slot.color.a = 0;
        }

        onBegin();
        moveObject(current.x, current.y);
    }

    function onPointerDown(event: FederatedPointerEvent) {
        if (pointer || restoreOnTap || !canBegin())
            return;

        pointer = {
            id: event.pointerId,
            startX: event.global.x,
            startY: event.global.y,
            x: event.global.x,
            y: event.global.y,
            started: false
        };

        if (drag.gesture === 6)
            holdTimer = setTimeout(begin, 300);
    }

    function onPointerMove(event: FederatedPointerEvent) {
        const current = pointer;
        if (!current || current.id !== event.pointerId)
            return;

        current.x = event.global.x;
        current.y = event.global.y;

        if (!current.started && (current.x !== current.startX || current.y !== current.startY))
            begin();

        if (current.started)
            moveObject(current.x, current.y);
    }

    function onPointerUp(event: FederatedPointerEvent, cancelled = false) {
        const current = pointer;
        if (!current || current.id !== event.pointerId)
            return;

        clearHold();
        pointer = undefined;
        if (!current.started)
            return;

        let animation: string | undefined;
        if (!cancelled)
        {
            moveObject(event.global.x, event.global.y);

            const prefabParent = scene.nodes[0].parent!;
            const point = prefabParent.toLocal(object.getGlobalPosition());
            const worldScale = (2 * 5 / 1080) * Math.abs(scene.getGamePortraitScale());
            let closestDistance = 10;

            for (const target of targets)
            {
                const local = target.node.toLocal(event.global);
                if (!target.bounds.contains(local.x, local.y))
                    continue;

                const destination = prefabParent.toLocal(target.node.getGlobalPosition());
                const distance = Math.hypot(point.x - destination.x, point.y - destination.y) * worldScale;

                if (distance < closestDistance)
                {
                    closestDistance = distance;
                    animation = target.animation;
                }
            }
        }

        resetObject();
        onEnd();

        lastDragEndAt = performance.now();

        if (animation)
        {
            restoreSlots();
            onDrop(animation);
        }
        else if (hiddenSlots.length > 0)
        {
            restoreOnTap = true;
        }
    }

    function onPointerTap() {
        if (!restoreOnTap || performance.now() - lastDragEndAt < 100)
            return;

        restoreOnTap = false;

        restoreSlots();
        onRestore();
    }

    function onPointerCancel(event: FederatedPointerEvent) {
        onPointerUp(event, true);
    }

    hitbox.on("pointerdown", onPointerDown);
    hitbox.on("globalpointermove", onPointerMove);
    hitbox.on("pointerup", onPointerUp);
    hitbox.on("pointerupoutside", onPointerUp);
    hitbox.on("pointercancel", onPointerCancel);
    hitbox.on("pointertap", onPointerTap);

    return () => {
        hitbox.off("pointerdown", onPointerDown);
        hitbox.off("globalpointermove", onPointerMove);
        hitbox.off("pointerup", onPointerUp);
        hitbox.off("pointerupoutside", onPointerUp);
        hitbox.off("pointercancel", onPointerCancel);
        hitbox.off("pointertap", onPointerTap);

        clearHold();

        if (pointer?.started)
        {
            resetObject();
            onEnd();
        }

        pointer = undefined;
        restoreSlots();
    };
}
