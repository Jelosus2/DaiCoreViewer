import type { MinigameDefinition } from "../types";
import type { MachairodusTargetView } from "./machairodusMotion";

import MachairodusMinigame from "@/components/minigames/MachairodusMinigame.vue";

import { loadMachairodusAssets } from "./machairodusAssets";
import { targetWidth, targetHeight } from "./machairodusMotion";
import { createMachairodusSpark } from "./machairodusEffects";
import { Container, Sprite } from "pixi.js";

export const machairodusMinigame: MinigameDefinition = {
    modelId: 3018005,
    l2dName: "30180_skin_Machairodus05a_spine",
    framing: {
        mode: "game"
    },
    async create(context) {
        const ui = await loadMachairodusAssets();
        if (context.signal.aborted)
            return;

        const urls = [...ui.backgrounds, ui.sprites.img_04_01, ui.sprites.img_04_02, ...ui.effects];
        const [background1, background2, gold, normal, streak, flare] = await Promise.all(urls.map(context.loadTexture));

        if (context.signal.aborted)
            return;

        await context.uploadTextures([
            background1,
            background2,
            gold,
            normal,
            streak,
            flare
        ]);

        if (context.signal.aborted)
            return;

        const world = new Container();
        world.eventMode = "none";
        world.visible = false;

        const backgrounds = [background1, background2].map((texture) => {
            const sprite = new Sprite(texture);
            sprite.anchor.set(0.5);
            sprite.width = 2590;
            sprite.height = 1080;

            return sprite;
        });

        const targets = new Container();

        world.addChild(backgrounds[0], targets, backgrounds[1]);
        context.camera.addChildAt(world, 0);

        const targetSprites = new Map<number, Sprite>();
        const targetEffects = new Map<number, ReturnType<typeof createMachairodusSpark>>();

        let open = false;
        let destroyed = false;

        function removeTarget(id: number) {
            targetSprites.get(id)?.destroy();
            targetSprites.delete(id);

            targetEffects.get(id)?.view.destroy({ children: true });
            targetEffects.delete(id);
        }

        function clearTargets() {
            for (const id of targetSprites.keys())
                removeTarget(id);
        }

        function updateTargets(values: MachairodusTargetView[]) {
            if (destroyed || !open)
                return;

            const ids = new Set<number>();

            for (const target of values)
            {
                ids.add(target.id);
                let sprite = targetSprites.get(target.id);

                if (!sprite)
                {
                    sprite = new Sprite(target.gold ? gold : normal);
                    sprite.anchor.set(0.5, 1);

                    targets.addChild(sprite);
                    targetSprites.set(target.id, sprite);
                }

                const fold = Math.max(0, Math.cos(target.tilt * Math.PI / 180));
                const direction = target.upper ? -1 : 1;

                sprite.position.set(target.x, target.y + direction * targetHeight / 2);
                sprite.scale.set(direction * targetWidth / sprite.texture.width, direction * fold * targetHeight / sprite.texture.height);

                if (target.exitAge !== null)
                {
                    let spark = targetEffects.get(target.id);

                    if (!spark)
                    {
                        spark = createMachairodusSpark(streak, flare);

                        targetEffects.set(target.id, spark);
                        targets.addChild(spark.view);
                    }

                    spark.view.position.set(target.x + direction * 15.2 * 1.024, target.y - direction * 6.4 * 1.024);
                    spark.view.scale.set(direction * 1.024, direction * 1.024);
                    spark.update(target.exitAge);
                }
            }

            for (const id of targetSprites.keys())
            {
                if (!ids.has(id))
                    removeTarget(id);
            }
        }

        return {
            overlay: {
                component: MachairodusMinigame,
                props: {
                    sprites: ui.sprites,
                    playAction: context.playAction,
                    targetsChanged: updateTargets
                }
            },
            setOpen(value) {
                if (destroyed)
                    return;

                open = value;
                world.visible = value;

                if (!value)
                    clearTargets();
            },
            destroy() {
                if (destroyed)
                    return;

                destroyed = true;
                open = false;

                clearTargets();
                world.destroy({ children: true });
            }
        };
    }
};
