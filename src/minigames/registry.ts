import type { MinigameDefinition } from "./types";

import { machairodusMinigame } from "./machairodusMinigame";
import { vodkaMinigame } from "./vodkaMinigame";

const minigames = [machairodusMinigame, vodkaMinigame];

export function findMinigame(modelId: number | undefined, l2dName: string): MinigameDefinition | undefined {
    return minigames.find((game) => game.modelId === modelId && game.l2dName === l2dName);
}
