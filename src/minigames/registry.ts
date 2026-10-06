import type { MinigameDefinition } from "./types";

import { machairodusMinigame } from "./machairodus/machairodusMinigame";
import { vodkaMinigame } from "./vodka/vodkaMinigame";
import { melodyMinigame } from "./melody/melodyMinigame";
import { poseidonMinigame } from "./poseidon/poseidonMinigame";
import { ijenMinigame } from "./ijen/ijenMinigame";
import { lycorisMinigame } from "./lycoris/lycorisMinigame";

const minigames = [machairodusMinigame, vodkaMinigame, melodyMinigame, poseidonMinigame, ijenMinigame, lycorisMinigame];

export function findMinigame(modelId: number | undefined, l2dName: string): MinigameDefinition | undefined {
    return minigames.find((game) => game.modelId === modelId && game.l2dName === l2dName);
}
