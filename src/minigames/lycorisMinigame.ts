import type { MinigameDefinition } from "./types";

import LycorisMinigame from "@/components/minigames/LycorisMinigame.vue";

import { loadLycorisAssets } from "./lycorisAssets";

export const lycorisMinigame: MinigameDefinition = {
    modelId: 7040003,
    l2dName: "70400_skin_LycorisRadiata03a_spine",
    framing: {
        mode: "game"
    },
    async create(context) {
        const assets = await loadLycorisAssets(context.signal);
        if (context.signal.aborted)
        {
            assets.images.clear();
            return;
        }

        return {
            overlay: {
                component: LycorisMinigame,
                props: {
                    assets,
                    playAction: context.playAction
                }
            },
            destroy() {
                assets.images.clear();
            }
        };
    }
};
