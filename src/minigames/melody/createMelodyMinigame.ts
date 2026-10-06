import type { MinigamePortrait } from "../types";

type Phase =
    | "stopped"
    | "choose"
    | "reveal"
    | "result"
    | "reaction"
    | "final"
    | "exit"
    | "closing";

export type MelodyOutcome = "win" | "lose" | "draw";

export interface MelodyMinigameView {
    phase: Phase;
    age: number;
    playerHp: number;
    cardHp: number;
    choice: number;
    outcome: MelodyOutcome;
    canChoose: boolean;
}

export function createMelodyMinigame(options: Pick<MinigamePortrait, "playAction" | "isIdle">) {
    const actions = [3, 5, 4];

    let phase: Phase = "stopped";
    let age = 0;
    let playerHp = 3;
    let cardHp = 3;
    let choice = 1;
    let outcome: MelodyOutcome = "draw";
    let delay = Infinity;
    let generation = 0;

    function enter(next: Phase, wait = Infinity) {
        phase = next;
        age = 0;
        delay = wait;
    }

    function finish() {
        if (cardHp > 0)
            options.playAction(24);

        enter("exit");
    }

    return {
        start() {
            generation++;
            playerHp = cardHp = 3;
            choice = 1;
            outcome = "draw";
            enter("choose");
        },
        stop() {
            generation++;
            enter("stopped");
        },
        choose(index: number): boolean {
            if (phase !== "choose" || age <= 0.5 || !Number.isInteger(index) || index < 1 || index > 3)
                return false;

            const roll = Math.floor(Math.random() * 10) + 1;
            const result: MelodyOutcome = roll <= 6
                ? "win"
                : roll <= 9 ? "lose" : "draw";

            const card = result === "win"
                ? index % 3 + 1
                : result === "lose" ? (index + 1) % 3 + 1 : index;

            if (!options.playAction(actions[card - 1]))
                return false;

            choice = index;
            outcome = result;
            enter("reveal", 3);

            return true;
        },
        exit() {
            if (phase !== "choose")
                return;

            playerHp = 0;
            finish();
        },
        advance(seconds: number) {
            if (phase === "stopped" || phase === "closing" || !Number.isFinite(seconds) || seconds < 0)
                return;

            age += seconds;

            if (phase === "exit")
            {
                if (options.isIdle() && options.playAction(2))
                    enter("closing");

                return;
            }

            delay -= seconds;

            if (delay >= 0)
                return;

            if (phase === "reveal")
            {
                enter("result", 2);
            }
            else if (phase === "result")
            {
                if (outcome === "draw")
                {
                    enter("choose");
                    return;
                }

                if (outcome === "win")
                {
                    cardHp--;

                    if (cardHp >= 1)
                        options.playAction(6 + (2 - cardHp));

                    options.playAction(10);
                    enter("reaction", cardHp === 0 ? 0.1 : 2);
                }
                else
                {
                    playerHp--;
                    enter("reaction");

                    const token = generation;

                    options.playAction(12 + (2 - playerHp), () => {
                        if (token === generation && phase === "reaction")
                            delay = 0.1;
                    });
                }
            }
            else if (phase === "reaction")
            {
                if (cardHp === 0)
                {
                    enter("final");
                    options.playAction(11);
                }
                else if (playerHp === 0)
                {
                    finish();
                }
                else
                {
                    enter("choose");
                }
            }
        },
        snapshot(): MelodyMinigameView {
            return {
                phase,
                age,
                playerHp,
                cardHp,
                choice,
                outcome,
                canChoose: phase === "choose" && age > 0.5
            };
        },
        isRunning(): boolean {
            return phase !== "stopped" && phase !== "closing";
        }
    }
}
