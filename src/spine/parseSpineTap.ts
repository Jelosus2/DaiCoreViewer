import type { SpineActionArea, SpineActionItem, SpineActionValue } from "@/types/spine";

import { Spine } from "@esotericsoftware/spine-pixi-v8";

const supportedKeys = new Set(["isHide", "activation", "changeIdle", "clicks", "orderActions", "randomActions"]);

export interface ParsedSpineTap {
    item: SpineActionItem;
    area: SpineActionArea;
    trackIndex: number;
    initiallyHidden: boolean;
    animationNames: string[];
    clicks?: number[];
    activation?: Map<number, boolean>;
    changeIdle?: { animation: string; delayMs: number; ignoredItems: number[]; };
    orderActions?: string[];
    randomActions?: Array<{ animation: string; weight: number; }>;
}

export function parseSpineTap(item: SpineActionItem, spine: Spine): ParsedSpineTap | undefined {
    const area = item.areas?.[0];

    if (
        (item.gesture ?? 0) !== 0 ||
        (item.role ?? 1) !== 1 ||
        item.sName === "in" ||
        !area ||
        !area.every(Number.isFinite) ||
        area[2] <= 0 ||
        area[3] <= 0 ||
        ![2, 6, 7].includes(item.sType)
    )
    {
        return;
    }

    const trackIndex = item.sType < 6 ? 1 : item.index;
    if (!Number.isInteger(trackIndex) || trackIndex <= 0)
        return;

    const content: Record<string, SpineActionValue> = item.content ?? {};
    if (Object.keys(content).some((key) => !supportedKeys.has(key)))
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
            const index = Number(key);
            if (!Number.isInteger(index) || index <= 0 || (value !== 0 && value !== 1))
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
            if (typeof value !== "number" || !Number.isInteger(value) || value <= 0)
                return;

            ignoredItems.push(value);
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

    if ((orderActions && randomActions) || (clicks && (orderActions || randomActions || changeIdle)))
        return;

    const animationNames = orderActions ?? randomActions?.map((entry) => entry.animation) ?? (item.sName ? [item.sName] : []);
    if (animationNames.length === 0 && !activation && !changeIdle)
        return;

    if (animationNames.some((name) => !spine.skeleton.data.findAnimation(name)))
        return;

    if (clicks && (animationNames.length !== 1 || (spine.skeleton.data.findAnimation(animationNames[0])?.duration ?? 0) <= 0))
        return;

    return {
        item,
        area,
        trackIndex,
        initiallyHidden: "isHide" in content,
        animationNames,
        clicks,
        activation,
        changeIdle,
        orderActions,
        randomActions
    };
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
