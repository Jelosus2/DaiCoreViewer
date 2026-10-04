import type { MinigameDefinition } from "./types";

import { machairodusMinigame } from "./machairodusMinigame";
import { vodkaMinigame } from "./vodkaMinigame";
import { melodyMinigame } from "./melodyMinigame";

const minigames = [machairodusMinigame, vodkaMinigame, melodyMinigame];

export function findMinigame(modelId: number | undefined, l2dName: string): MinigameDefinition | undefined {
    return minigames.find((game) => game.modelId === modelId && game.l2dName === l2dName);
}
