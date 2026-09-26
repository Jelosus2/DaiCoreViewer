import type { SpineActionConfig, SpineActionItem } from "@/types/spine";

import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { Container, Graphics, Rectangle, UPDATE_PRIORITY } from "pixi.js";

type TrackEntry = ReturnType<Spine["state"]["setAnimation"]>;

interface StagedTap {
    entry: TrackEntry;
    animationName: string;
    duration: number;
    points: number[];
    step: number;
    targetTime: number;
}

export function createSpineInteractions(layer: Container, spine: Spine, interaction: SpineActionConfig, showHotspots: boolean) {
    const outlines: Graphics[] = [];
    const stages = new Map<number, StagedTap>();
    let tracking = false;
    let destroyed = false;
    let nextTapAt = 0;

    function stopTracking() {
        if (!tracking)
            return;

        spine.ticker.remove(updateStages);
        tracking = false;
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

            if (stage.step === stage.points.length - 1)
            {
                stage.entry.trackTime = 0;
                spine.state.clearTrack(trackIndex);
                spine.skeleton.setToSetupPose();
                stages.delete(trackIndex);
            }
            else
            {
                stage.entry.trackTime = stage.targetTime;
                stage.entry.timeScale = 0;
            }
        }

        if (stages.size === 0)
            stopTracking();
    }

    function playStaged(item: SpineActionItem, animationName: string, duration: number, points: number[]) {
        const trackIndex = item.index;
        let stage = stages.get(trackIndex);

        if (stage && spine.state.getCurrent(trackIndex) !== stage.entry)
        {
            stages.delete(trackIndex);
            stage = undefined;
        }

        if (stage)
        {
            if (stage.animationName !== animationName || stage.entry.timeScale !== 0)
                return;

            const step = stage.step + 1;
            if (step >= stage.points.length)
                return;

            stage.step = step;
            stage.targetTime = stage.points[step] * stage.duration;
            stage.entry.timeScale = stage.points[step] === 0 ? -1 : 1;
            return;
        }

        const entry = spine.state.setAnimation(trackIndex, animationName, false);
        entry.timeScale = 1;

        stages.set(trackIndex, {
            entry,
            animationName,
            duration,
            points,
            step: 0,
            targetTime: points[0] * duration
        });

        if (!tracking)
        {
            spine.ticker.add(updateStages, undefined, UPDATE_PRIORITY.LOW);
            tracking = true;
        }
    }

    for (const item of interaction.items)
    {
        const points = stagedTapPoints(item);
        if (!isSimpleTap(item) && !points)
            continue;

        const animationName = item.sName;
        const area = item.areas?.[0];

        if (!animationName || !area)
            continue;

        const animation = spine.skeleton.data.findAnimation(animationName);
        if (!animation || (points && animation.duration <= 0))
            continue;

        const [x, y, width, height, angle] = area;
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

        hitbox.on("pointertap", () => {
            const now = performance.now();
            if (destroyed || now < nextTapAt)
                return;

            if (!points && item.sType === 2 && spine.state.getCurrent(1))
                return;

            nextTapAt = now + 500;

            if (points)
            {
                playStaged(item, animationName, animation.duration, points);
            }
            else if (item.sType === 2)
            {
                spine.state.setEmptyAnimation(1, 0);
                const entry = spine.state.addAnimation(1, animationName, false, 0);
                entry.mixDuration = 0.2;
                spine.state.addEmptyAnimation(1, 0.5, 0);
            }
            else
            {
                spine.state.setAnimation(item.index, animationName, false);
            }
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
            stopTracking();
            stages.clear();
            outlines.length = 0;
        }
    }
}

function hasTapArea(item: SpineActionItem): boolean {
    const area = item.areas?.[0];

    return item.gesture === 0 &&
        (item.role ?? 1) === 1 &&
        !!item.sName &&
        item.sName !== "in" &&
        !!area &&
        area.every(Number.isFinite) &&
        area[2] > 0 &&
        area[3] > 0;
}

function isSimpleTap(item: SpineActionItem): boolean {
    return hasTapArea(item) &&
        (item.sType === 2 || item.sType === 6) &&
        item.content === undefined &&
        (item.sType !== 6 || (Number.isInteger(item.index) && item.index > 0));
}

function stagedTapPoints(item: SpineActionItem): number[] | undefined {
    const content = item.content;

    if (
        !hasTapArea(item) ||
        item.sType !== 7 ||
        !Number.isInteger(item.index) ||
        item.index <= 1 ||
        !content ||
        Object.keys(content).length !== 1
    )
    {
        return;
    }

    const raw = content.clicks;
    if (!Array.isArray(raw) || raw.length === 0)
        return;

    const points: number[] = [];
    let previous = 0;

    for (const [index, value] of raw.entries())
    {
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)
            return;

        if (value === 0)
        {
            // A zero target means reverse to the start; it must be the final step.
            if (index !== raw.length - 1 || index === 0)
                return;
        }
        else if (value <= previous)
        {
            return;
        }

        points.push(value);
        previous = value;
    }

    return points;
}
