import type { MinigameDefinition } from "../types";

import IjenMinigame from "@/components/minigames/IjenMinigame.vue";

import { loadIjenAssets } from "./ijenAssets";

export const ijenMinigame: MinigameDefinition = {
    modelId: 6035003,
    l2dName: "60350_skin_Ijen03_spine",
    framing: {
        mode: "game"
    },
    async create(context) {
        const assets = await loadIjenAssets(context.signal);
        if (context.signal.aborted)
        {
            assets.images.clear();
            return;
        }

        return {
            overlay: {
                component: IjenMinigame,
                props: {
                    assets,
                    audio: context.audio,
                    playAction: context.playAction,
                    isIdle: context.isIdle
                }
            },
            destroy() {
                assets.images.clear();
            }
        };
    }
};
