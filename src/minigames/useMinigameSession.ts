import type { SpineActionConfig, SpinePlacement, SpineRender} from "@/types/spine";
import type { MinigameInstance, MinigameOverlay, MinigamePortrait, MinigameScene, MinigameAudio } from "./types";
import type { Texture } from "pixi.js";

import { findMinigame } from "./registry";
import { onScopeDispose, ref, shallowRef } from "vue";

interface MinigameSessionOptions extends MinigamePortrait {
    render: SpineRender;
    interaction?: SpineActionConfig;
    audio: MinigameAudio;
    loadTexture: (url: string) => Promise<Texture>;
    onOpenChange: (open: boolean) => void;
}

export function useMinigameSession(options: MinigameSessionOptions) {
    const definition = findMinigame(options.interaction?.id,  options.render.l2dName);

    const open = ref(false);
    const overlay = shallowRef<MinigameOverlay | null>(null);
    const controller = new AbortController();

    let instance: MinigameInstance | undefined;
    let preparing: Promise<void> | undefined;
    let destroyed = false;

    function waitOrAbort(task: Promise<unknown>) {
        const signal = controller.signal;

        if (signal.aborted)
        {
            void task.catch(() => {});
            return Promise.resolve();
        }

        return new Promise<void>((resolve, reject) => {
            const finish = () => {
                signal.removeEventListener("abort", finish);
                resolve();
            };

            signal.addEventListener("abort", finish, { once: true });

            task.then(finish, (error: unknown) => {
                signal.removeEventListener("abort", finish);
                reject(error);
            });
        });
    }

    function setOpen(value: boolean) {
        if (destroyed || !instance || open.value === value)
            return;

        open.value = value;
        if (!value)
            options.audio.stopMusic();

        instance.setOpen?.(value);
        options.onOpenChange(value);
    }

    function destroy() {
        if (destroyed)
            return;

        destroyed = true;

        controller.abort();
        options.audio.stopMusic();

        open.value = false;
        overlay.value = null;

        instance?.destroy?.();
        instance = undefined;
    }

    onScopeDispose(destroy);

    return {
        supported: definition !== undefined,
        open,
        overlay,
        setOpen,
        destroy,
        prepare(scene: MinigameScene) {
            if (destroyed || !definition)
                return Promise.resolve();

            if (preparing)
                return preparing;

            const task = definition.create({
                ...scene,
                audio: {
                    playEffect: (bank, cue) => {
                        if (!destroyed && open.value)
                            options.audio.playEffect(bank, cue);
                    },
                    playButton: (name, cooldownMs, key) => {
                        if (!destroyed && open.value)
                            options.audio.playButton(name, cooldownMs, key);
                    },
                    playVoice: (id) => {
                        if (!destroyed && open.value)
                            options.audio.playVoice(id);
                    },
                    playMusic: (bank, cue) => {
                        if (!destroyed && open.value)
                            options.audio.playMusic(bank, cue);
                    },
                    stopMusic: () => options.audio.stopMusic()
                },
                signal: controller.signal,
                loadTexture: (url) => {
                    if (controller.signal.aborted)
                        return Promise.reject(new Error("Minigame session is disposed"));

                    return options.loadTexture(url);
                },
                uploadTextures: (textures) => controller.signal.aborted
                    ? Promise.resolve()
                    : waitOrAbort(scene.uploadTextures(textures)),
                playAction: (index, onComplete) => !destroyed && open.value && options.playAction(
                    index,
                    onComplete
                        ? () => {
                            if (!destroyed && open.value)
                                onComplete();
                        }
                        : undefined
                ),
                getSceneNode: (path) => destroyed ? undefined : options.getSceneNode(path),
                getStagedAction: (index) => destroyed || !open.value ? undefined : options.getStagedAction(index),
                isIdle: () => !destroyed && open.value && options.isIdle()
            }).then((created) => {
                if (destroyed)
                {
                    created?.destroy?.();
                    return;
                }

                instance = created;
                overlay.value = created?.overlay ?? null;
            });

            preparing = waitOrAbort(task);
            return preparing;
        },
        getPlacement(placement: SpinePlacement | undefined): SpinePlacement | undefined {
            return open.value ? definition?.placement ?? placement : placement;
        }
    };
}
