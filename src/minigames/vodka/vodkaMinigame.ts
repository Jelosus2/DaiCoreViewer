import type { MinigameDefinition } from "../types";

import VodkaMinigame from "@/components/minigames/VodkaMinigame.vue";

import { loadVodkaAssets } from "./vodkaAssets";

export const vodkaMinigame: MinigameDefinition = {
    modelId: 7501003,
    l2dName: "75010_skin_VodkaMirror03_spine",
    placement: [0, 0, 1],
    async create(context) {
        const sprites = await loadVodkaAssets();
        if (context.signal.aborted)
            return;

        return {
            overlay: {
                component: VodkaMinigame,
                props: {
                    sprites,
                    audio: context.audio,
                    playAction: context.playAction,
                    isIdle: context.isIdle
                }
            }
        };
    }
};
