import type { SpineActionArea, SpineActionItem, SpineActionValue } from "@/types/spine";

import { Spine } from "@esotericsoftware/spine-pixi-v8";

const supportedKeys = new Set([
    "isHide", "activation", "changeIdle", "clicks", "orderActions", "randomActions",
    "conditions", "needIdle", "needClicks", "noClick", "trackIndex", "clickTime",
    "reset7", "nextClick", "noFade", "guochange", "actions", "inIgnore", "changerole",
    "isSpineUI", "gestureDatas"
]);

export interface SpineRoleTransition {
    target: string;
    overlay?: string;
    durationMs: number;
    followUp?: number;
    transfers?: Array<[source: number, target: number]>;
    role: number;
}

export interface ParsedSpineTap {
    item: SpineActionItem;
    area?: SpineActionArea;
    trackIndex: number;
    initiallyHidden: boolean;
    animationNames: string[];
    clicks?: number[];
    activation?: Map<number, boolean>;
    changeIdle?: { animation: string; delayMs: number; ignoredItems: number[]; };
    orderActions?: string[];
    randomActions?: Array<{ animation: string; weight: number; }>;
    conditions?: { itemIndex: number; minimum: number; maximum?: number; };
    needIdle: boolean;
    needClicks?: number[];
    noClick?: number[];
    clickTime?: number;
    reset7?: number[];
    nextClick?: number;
    noFade: boolean;
    guochange: boolean;
    actions?: { stopPerc: number; stopTime: number; stopLimit: number; stopCount: number; };
    changeRole?: SpineRoleTransition;
    spineUI: boolean;
    gesture?: {
        direction: 1 | 2 | 3 | 4;
        speed: number;
        limit: number;
        split: number;
        stopTime?: number;
    };
}

export function parseSpineTap(item: SpineActionItem, spine: Spine, role = 1): ParsedSpineTap | undefined {
    const area = item.areas?.[0];
    const gestureValue = item.gesture ?? 0;
    const isGesture = gestureValue >= 1 && gestureValue <= 4;

    if (
        (gestureValue !== 0 && !isGesture) ||
        (item.role ?? 1) !== role ||
        item.sName === "in" ||
        (area && (!area.every(Number.isFinite) || area[2] < 0 || area[3] < 0)) ||
        (!isGesture && ![2, 3, 6, 7].includes(item.sType)) ||
        (isGesture && ![4, 7, 9].includes(item.sType))
    )
    {
        return;
    }

    const content: Record<string, SpineActionValue> = item.content ?? {};
    if (Object.keys(content).some((key) => !supportedKeys.has(key)))
        return;

    if (isGesture && Object.keys(content).some((key) => key !== "gestureDatas" && key !== "isHide"))
        return;

    let gesture: ParsedSpineTap["gesture"];
    if (isGesture)
    {
        const raw = content.gestureDatas;
        if (!raw || typeof raw !== "object" || Array.isArray(raw))
            return;

        const speed = raw.speed;
        const limit = raw.limitPerc ?? 1;
        const split = raw.splitPerc ?? 1;
        const stopTime = raw.stopTime;

        if (
            typeof speed !== "number" || !Number.isFinite(speed) || speed <= 0 ||
            typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0 || limit > 1 ||
            typeof split !== "number" || !Number.isFinite(split) || split < 0 || split > 1 ||
            (stopTime !== undefined && (typeof stopTime !== "number" || !Number.isFinite(stopTime) || stopTime < 0))
        )
        {
            return;
        }

        gesture = {
            direction: gestureValue as 1 | 2 | 3 | 4,
            speed,
            limit,
            split,
            stopTime: typeof stopTime === "number" ? stopTime : undefined
        };
    }

    const spineUI = "isSpineUI" in content;
    if (spineUI && !enabled(content.isSpineUI))
        return;

    let trackIndex = item.sType < 6 ? 1 : item.index;
    if ("trackIndex" in content)
    {
        const override = positiveIndex(content.trackIndex);
        if (override === undefined)
            return;

        if (item.sType >= 6)
            trackIndex = override;
    }

    if (!Number.isInteger(trackIndex) || trackIndex <= 0)
        return;

    let clicks: number[] | undefined;
    if ("clicks" in content)
    {
        clicks = parseClickPoints(content.clicks);
        if (!clicks || item.sType !== 7 || trackIndex === 1)
            return;
    }

    let activation: Map<number, boolean> | undefined;
    if ("activation" in content)
    {
        const raw = content.activation;
        if (!raw || typeof raw !== "object" || Array.isArray(raw))
            return;

        activation = new Map();

        for (const [key, value] of Object.entries(raw))
        {
            const index = positiveIndex(key);
            if (index === undefined || (value !== 0 && value !== 1))
                return;

            activation.set(index, value === 1);
        }
    }

    let changeIdle: ParsedSpineTap["changeIdle"];
    if ("changeIdle" in content)
    {
        const raw = content.changeIdle;

        if (
            !Array.isArray(raw) ||
            raw.length < 2 ||
            typeof raw[0] !== "string" ||
            typeof raw[1] !== "number" ||
            !Number.isFinite(raw[1]) ||
            raw[1] < 0 ||
            !spine.skeleton.data.findAnimation(raw[0])
        )
        {
            return;
        }

        const ignoredItems: number[] = [];

        for (const value of raw.slice(2))
        {
            const index = positiveIndex(value);
            if (index === undefined)
                return;

            ignoredItems.push(index);
        }

        changeIdle = {
            animation: raw[0],
            delayMs: raw[1],
            ignoredItems
        };
    }

    let orderActions: string[] | undefined;
    if ("orderActions" in content)
    {
        const raw = content.orderActions;
        if (!Array.isArray(raw) || raw.length === 0 || !raw.every((value): value is string => typeof value === "string" && value.length > 0))
            return;

        orderActions = raw;
    }

    let randomActions: ParsedSpineTap["randomActions"];
    if ("randomActions" in content)
    {
        const raw = content.randomActions;
        if (!Array.isArray(raw) || raw.length === 0)
            return;

        randomActions = [];

        for (const pair of raw)
        {
            if (
                !Array.isArray(pair) ||
                pair.length !== 2 ||
                typeof pair[0] !== "string" ||
                pair[0].length === 0 ||
                typeof pair[1] !== "number" ||
                !Number.isFinite(pair[1]) ||
                pair[1] <= 0
            )
            {
                return;
            }

            randomActions.push({ animation: pair[0], weight: pair[1] });
        }
    }

    let conditions: ParsedSpineTap["conditions"];
    if ("conditions" in content)
    {
        const raw = content.conditions;
        if (!Array.isArray(raw) || (raw.length !== 2 && raw.length !== 3))
            return;

        const itemIndex = positiveIndex(raw[0]);
        const minimum = raw[1];
        const maximum = raw[2];

        if (
            itemIndex === undefined ||
            typeof minimum !== "number" ||
            !Number.isFinite(minimum) ||
            minimum < 0 ||
            minimum > 1 ||
            (maximum !== undefined && (typeof maximum !== "number" || !Number.isFinite(maximum) || maximum < minimum || maximum > 1))
        )
        {
            return;
        }

        conditions = {
            itemIndex,
            minimum,
            maximum
        };
    }

    const needClicks = "needClicks" in content ? indexList(content.needClicks) : undefined;
    const noClick = "noClick" in content ? indexList(content.noClick) : undefined;
    const reset7 = "reset7" in content ? indexList(content.reset7) : undefined;

    if (("needClicks" in content && !needClicks) || ("noClick" in content && !noClick) || ("reset7" in content && !reset7))
        return;

    let nextClick: number | undefined;
    if ("nextClick" in content)
    {
        nextClick = positiveIndex(content.nextClick);
        if (nextClick === undefined || item.sType !== 2 || clicks)
            return;
    }

    let clickTime: number | undefined;
    if ("clickTime" in content)
    {
        const raw = content.clickTime;
        if (typeof raw !== "number" && typeof raw !== "string")
            return;

        clickTime = Number(raw);
        if (!clicks || !Number.isFinite(clickTime) || clickTime <= 0)
            return;
    }

    const needIdle = enabled(content.needIdle);
    const noFade = enabled(content.noFade);
    const guochange = enabled(content.guochange);

    if (
        ("needIdle" in content && !needIdle) ||
        ("noFade" in content && !noFade) ||
        ("guochange" in content && !guochange) ||
        ("inIgnore" in content && !enabled(content.inIgnore))
    )
    {
        return;
    }

    let actions: ParsedSpineTap["actions"];
    if ("actions" in content)
    {
        const raw = content.actions;
        if (!raw || typeof raw !== "object" || Array.isArray(raw) || item.sType !== 3)
            return;

        const { stopPerc, stopTime, stopLimit, stopCount } = raw;

        if (
            typeof stopPerc !== "number" || !Number.isFinite(stopPerc) || stopPerc <= 0 || stopPerc >= 1 ||
            typeof stopTime !== "number" || !Number.isFinite(stopTime) || stopTime <= 0 ||
            typeof stopLimit !== "number" || !Number.isFinite(stopLimit) || stopLimit < stopPerc || stopLimit > 1 ||
            (stopCount !== undefined && (typeof stopCount !== "number" || !Number.isInteger(stopCount) || stopCount < 0))
        )
        {
            return;
        }

        actions = {
            stopPerc,
            stopTime,
            stopLimit,
            stopCount: stopCount ?? 3
        };
    }

    let changeRole: SpineRoleTransition | undefined;
    if ("changerole" in content)
    {
        const raw = content.changerole;

        if (
            !Array.isArray(raw) || raw.length < 3 || raw.length > 6 ||
            typeof raw[0] !== "string" || !raw[0] ||
            typeof raw[1] !== "string" ||
            typeof raw[2] !== "number" || !Number.isFinite(raw[2]) || raw[2] < 0
        )
        {
            return;
        }

        const followUp = raw[3] === undefined || raw[3] === "" ? undefined : positiveIndex(raw[3]);
        if (raw.length > 3 && raw[3] !== "" && followUp === undefined)
            return;

        let transfers: SpineRoleTransition["transfers"];
        if (raw[4] !== undefined && raw[4] !== "")
        {
            if (typeof raw[4] !== "string")
                return;

            const parts = raw[4].split("_").map(positiveIndex);
            if (parts.length % 2 !== 0 || parts.some((value) => value === undefined))
                return;

            transfers = [];

            for (let index = 0; index < parts.length; index += 2)
                transfers.push([parts[index]!, parts[index + 1]!]);
        }

        const nextRole = raw[5] === undefined || raw[5] === ""
            ? 3 - (item.role ?? 1)
            : positiveIndex(raw[5]);

        if (nextRole === undefined)
            return;

        changeRole = {
            target: raw[0],
            overlay: raw[1] || undefined,
            durationMs: raw[2],
            followUp,
            transfers,
            role: nextRole
        };
    }

    if (
        (orderActions && randomActions) ||
        (clicks && (orderActions || randomActions || changeIdle || actions || nextClick)) ||
        (actions && (orderActions || randomActions || changeIdle || nextClick))
    )
    {
        return;
    }

    const animationNames = orderActions ?? randomActions?.map((entry) => entry.animation) ?? (item.sName ? [item.sName] : []);

    if (actions && animationNames.length !== 1)
        return;
    if (animationNames.length === 0 && !activation && !changeIdle && !nextClick && !reset7 && !changeRole)
        return;
    if (animationNames.some((name) => !spine.skeleton.data.findAnimation(name)))
        return;
    if (clicks && (animationNames.length !== 1 || (spine.skeleton.data.findAnimation(animationNames[0])?.duration ?? 0) <= 0))
        return;
    if (gesture && (animationNames.length !== 1 || (spine.skeleton.data.findAnimation(animationNames[0])?.duration ?? 0) <= 0))
        return;

    return {
        item, area, trackIndex, initiallyHidden: "isHide" in content, animationNames,
        clicks, activation, changeIdle, orderActions, randomActions, conditions,
        needIdle, needClicks, noClick, clickTime, reset7, nextClick, noFade, guochange, actions, changeRole,
        spineUI, gesture
    };
}

function positiveIndex(value?: SpineActionValue): number | undefined {
    if (typeof value !== "number" && typeof value !== "string")
        return;

    const result = Number(value);
    return Number.isInteger(result) && result > 0 ? result : undefined;
}

function indexList(value?: SpineActionValue): number[] | undefined {
    if (!Array.isArray(value) || value.length === 0)
        return;

    const result = value.map(positiveIndex);
    return result.every((entry): entry is number => entry !== undefined) ? result : undefined;
}

function enabled(value?: SpineActionValue): boolean {
    return value === 1 || value === true;
}

function parseClickPoints(value?: SpineActionValue): number[] | undefined {
    if (!Array.isArray(value) || value.length === 0)
        return;

    const points: number[] = [];
    let previous = 0;

    for (const [index, point] of value.entries())
    {
        if (typeof point !== "number" || !Number.isFinite(point) || point < 0 || point > 1)
            return;

        if (point === 0)
        {
            // A zero target means reverse to the start; it must be the final step.
            if (index === 0 || index !== value.length - 1)
                return;
        }
        else if (point <= previous)
        {
            return;
        }

        points.push(point);
        previous = point;
    }

    return points;
}
