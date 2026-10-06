import type { MinigamePortrait } from "../types";

export interface IjenArrow {
    delay: number;
    duration: number;
    start: number;
    end: number;
}

export interface IjenMinigameView {
    visible: boolean;
    ending: boolean;
    age: number;
    remaining: number;
    progress: number;
    target: number;
    missesLeft: number;
    arrow: number;
    shakeAge: number;
}

export function ijenArrowPosition(age: number, arrow: IjenArrow): number {
    const time = Math.max(0, age - arrow.delay) / arrow.duration;
    const phase = time - 2 * Math.floor(time / 2);

    return arrow.start + (arrow.end - arrow.start) * (1 - Math.abs(phase - 1));
}

export function createIjenMinigame(options: Pick<MinigamePortrait, "playAction" | "isIdle">, arrow: IjenArrow) {
    const nextClick = new Map<"hit" | "back", number>();
    let running = false;
    let closing = false;
    let ending = false;
    let result: number | undefined;
    let age = 0;
    let remaining = 15;
    let progress = 0.3;
    let target = 0.3;
    let missesLeft = 3;
    let shakeStart = -Infinity;

    function finishWhenIdle() {
        if (ending && result !== undefined && !closing && options.isIdle())
        {
            if (options.playAction(result === 1 ? 12 : 13))
                closing = true;
        }
    }

    return {
        start() {
            running = true;
            closing = ending = false;
            result = undefined;
            age = 0;
            remaining = 15;
            progress = target = 0.3;
            missesLeft = 3;
            shakeStart = -Infinity;

            nextClick.clear();
        },
        advance(seconds: number) {
            if (!running || closing || !Number.isFinite(seconds) || seconds < 0)
                return;

            age += seconds;

            if (progress !== target && result === undefined)
            {
                const amount = seconds * 0.3;
                progress = target > progress ? Math.min(target, progress + amount) : Math.max(target, progress - amount);

                if (progress === target && (progress === 0 || progress === 1))
                    result = progress;
            }

            finishWhenIdle();

            remaining = Math.max(0, remaining - seconds);
            if (remaining === 0 && !ending)
            {
                ending = true;
                result = -1;
            }
        },
        click(button: "hit" | "back", nowMs: number): boolean {
            if (!running || closing || !Number.isFinite(nowMs) || nowMs < (nextClick.get(button) ?? -Infinity))
                return false;

            nextClick.set(button, nowMs + 500);

            if (ending || (button === "hit" && progress !== target))
                return false;

            if (button === "back")
            {
                ending = true;
                result = -1;

                return true;
            }

            const y = ijenArrowPosition(age, arrow);

            if (y > 360)
            {
                target = Math.min(1, target + 0.3);
                shakeStart = age;
            }
            else if (y < 240)
            {
                target = Math.max(0, target - 0.1);
                missesLeft--;
            }

            if (missesLeft <= 0 || target >= 1 || target <= 0)
            {
                ending = true;

                if (missesLeft <= 0)
                    result = 0;
            }

            return true;
        },
        snapshot(): IjenMinigameView {
            return {
                visible: running && !closing,
                ending,
                age,
                remaining: Math.ceil(remaining),
                progress,
                target,
                missesLeft,
                arrow: ijenArrowPosition(age, arrow),
                shakeAge: age - shakeStart
            };
        },
        isRunning() {
            return running && !closing;
        },
        stop() {
            running = closing = ending = false;
            nextClick.clear();
        }
    };
}
