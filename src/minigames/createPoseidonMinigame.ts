import type { MinigamePortrait } from "./types";

type Button = "left" | "right" | "confirm" | "back";
type PoseidonOptions = Pick<MinigamePortrait, "playAction" | "isIdle" | "getStagedAction">;

const results = [
    [0.5, 0, 8],
    [0.3, 0.7, 9],
    [0.1, 0.4, 10],
    [0, 0.4, 11],
    [0.3, 0.4, 13]
] as const;

export function createPoseidonMinigame(options: PoseidonOptions) {
    const nextClick = new Map<Button, number>();
    let running = false;
    let closing = false;
    let age = 0;
    let changedFourthResult = false;

    return {
        start() {
            running = true;
            closing = false;
            age = 0;
            changedFourthResult = false;

            nextClick.clear();
        },
        advance(seconds: number) {
            if (running && !closing && Number.isFinite(seconds) && seconds >= 0)
                age += seconds;
        },
        click(button: Button, nowMs: number): boolean {
            if (!running || closing || !Number.isFinite(nowMs))
                return false;
            if (button === "back" && age < 1.5)
                return false;
            if (nowMs < (nextClick.get(button) ?? -Infinity))
                return false;

            nextClick.set(button, nowMs + 500);

            if (button === "back")
            {
                if (!options.playAction(16))
                    return false;

                closing = true;
                return true;
            }

            if (!options.isIdle())
                return false;

            if (button === "left" || button === "right")
            {
                const index = button === "left" ? 14 : 15;
                if (options.getStagedAction(index)?.playing)
                    return false;

                return options.playAction(index);
            }

            const left = options.getStagedAction(14);
            const right = options.getStagedAction(15);

            if (left?.playing || right?.playing)
                return false;

            const match = results.find(([a, b]) => a === (left?.progress ?? 0) && b === (right?.progress ?? 0));
            const index = match?.[2] === 11 && changedFourthResult ? 18 : match?.[2] ?? 12;

            if (!options.playAction(index))
                return false;

            if (index === 11)
                changedFourthResult = true;

            return true;
        },
        snapshot() {
            return { backVisible: running && age >= 1.5, closing };
        },
        isRunning() {
            return running && !closing;
        },
        stop() {
            running = false;
            closing = false;
            age = 0;

            nextClick.clear();
        }
    };
}
