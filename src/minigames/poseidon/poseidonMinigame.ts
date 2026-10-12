import type { MinigameDefinition } from "../types";

import PoseidonMinigame from "@/components/minigames/PoseidonMinigame.vue";

import { loadPoseidonAssets } from "./poseidonAssets";

export const poseidonMinigame: MinigameDefinition = {
    modelId: 7003005,
    l2dName: "70030_skin_Poseidon05_spine",
    framing: {
        mode: "game"
    },
    async create(context) {
        const image = await loadPoseidonAssets();
        if (context.signal.aborted)
            return;

        return {
            overlay: {
                component: PoseidonMinigame,
                props: {
                    image,
                    audio: context.audio,
                    playAction: context.playAction,
                    isIdle: context.isIdle,
                    getStagedAction: context.getStagedAction
                }
            }
        };
    }
};
