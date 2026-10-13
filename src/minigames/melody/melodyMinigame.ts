import type { MinigameDefinition } from "../types";

import MelodyMinigame from "@/components/minigames/MelodyMinigame.vue";

import { loadMelodyAssets } from "./melodyAssets";

export const melodyMinigame: MinigameDefinition = {
    modelId: 2008006,
    l2dName: "20080_skin_Melody06_spine",
    async create(context) {
        const { ui, images } = await loadMelodyAssets();

        if (context.signal.aborted)
        {
            images.clear();
            return;
        }

        function setMotion(mode: "idle" | "in" | "out", seconds = 0) {
            const node = context.getSceneNode("pos");
            if (!node)
                return;

            if (mode === "idle")
            {
                node.position.set(-51.2, -42);
                node.scale.set(0.85);
                return;
            }

            const clip = ui.motion[mode === "in" ? "Anim_zoomIn" : "Anim_zoomOut"];
            const cursor = Math.min(seconds, clip.duration) * ui.fps;
            const a = clip.frames[Math.min(Math.floor(cursor), clip.frames.length - 1)];
            const b = clip.frames[Math.min(Math.ceil(cursor), clip.frames.length - 1)];
            const fraction = cursor % 1;
            const pose = a.map((value, index) => value + (b[index] - value) * fraction);
            const base = mode === "in"
                ? [-51.2, -42, 0.85]
                : [709, 13.79, 1.3];

            let mix = Math.min(1, seconds / 0.25);
            const blended = pose.map((value, index) => base[index] + (value - base[index]) * mix);

            if (mode === "out")
            {
                mix = Math.max(0, Math.min(1, (seconds - clip.duration * 0.625) / 0.25));
                const idle = [-51.2, -42, 0.85];

                for (let index = 0; index < blended.length; index++)
                    blended[index] += (idle[index] - blended[index]) * mix;
            }

            node.position.set(blended[0], blended[1]);
            node.scale.set(blended[2]);
        }

        return {
            overlay: {
                component: MelodyMinigame,
                props: {
                    ui,
                    images,
                    audio: context.audio,
                    setMotion,
                    playAction: context.playAction,
                    isIdle: context.isIdle
                }
            },
            setOpen(open) {
                if (!open)
                    setMotion("idle");
            },
            destroy() {
                setMotion("idle");
                images.clear();
            }
        };
    }
};
