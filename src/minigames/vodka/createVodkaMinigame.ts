interface VodkaMinigameOptions {
    isIdle: () => boolean;
    playAction: (index: number) => boolean;
}

type Phase = "stopped" | "delay" | "playing" | "result" | "closing";

export interface VodkaMinigameView {
    fill: number;
    visible: boolean;
    opacity: number;
    canTap: boolean;
}

export function createVodkaMinigame(options: VodkaMinigameOptions) {
    let phase: Phase = "stopped";
    let fill = 0;
    let target = 0.2;
    let rising = true;
    let ready = false;
    let delay = 1;
    let hold = 0.1;
    let fadeAge = 0;
    let visible = false;
    let nextTapAt = -Infinity;

    function start() {
        phase = "delay";
        fill = 0;
        target = 0.2;
        rising = true;
        ready = false;
        delay = 1;
        hold = 0.1;
        fadeAge = 0;
        visible = false;
        nextTapAt = -Infinity;
    }

    function advance(deltaSeconds: number) {
        if (phase === "stopped" || phase === "closing" || !Number.isFinite(deltaSeconds) || deltaSeconds < 0)
            return;

        if (phase === "delay")
        {
            delay -= deltaSeconds;
            if (delay > 0)
                return;

            phase = "playing";
            visible = true;
        }

        fadeAge += deltaSeconds;

        if (target !== fill)
        {
            if (rising)
            {
                fill = Math.min(fill + 0.01, target, 1);

                if (!ready && fill >= 0.2)
                    ready = true;
            }
            else
            {
                fill = Math.max(0, target);
            }

            if (fill >= 1 || fill <= 0)
                phase = "result";

            if (fill >= target)
                rising = false;
        }

        if (phase === "result")
        {
            if (options.isIdle() && options.playAction(fill <= 0 ? 12 : 10))
            {
                phase = "closing";
                visible = false;
            }
        }
        else if (ready && !rising)
        {
            hold -= deltaSeconds;

            if (hold <= 0)
                target -= deltaSeconds / 0.5 / 100;
        }
    }

    return {
        start,
        advance,
        tap(nowMs: number): boolean {
            if (phase === "stopped" || nowMs < nextTapAt)
                return false;

            nextTapAt = nowMs + 100;

            if (phase !== "playing" || !ready)
                return false;

            if (options.isIdle())
                options.playAction(9);

            hold = 0.1;
            target += 0.18;
            rising = true;

            return true;
        },
        snapshot(): VodkaMinigameView {
            return {
                fill,
                visible,
                opacity: visible ? Math.min(1, fadeAge / 0.5) : 0,
                canTap: phase === "playing" && ready
            };
        },
        isRunning(): boolean {
            return phase !== "stopped" && phase !== "closing";
        },
        stop() {
            phase = "stopped";
            fill = 0;
            visible = false;
            ready = false;
        }
    }
}
