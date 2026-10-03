import type { SpineFraming, SpinePlacement } from "@/types/spine";
import type { Container, Texture } from "pixi.js";
import type { Component } from "vue";

export interface MinigamePortrait {
    playAction: (index: number) => boolean;
    isIdle: () => boolean;
}

export interface MinigameScene {
    camera: Container;
    uploadTextures: (textures: Texture[]) => Promise<void>;
}

export interface MinigameContext extends MinigamePortrait, MinigameScene {
    signal: AbortSignal;
    loadTexture: (url: string) => Promise<Texture>;
}

export interface MinigameOverlay {
    component: Component;
    props: Record<string, unknown>;
}

export interface MinigameInstance {
    overlay: MinigameOverlay;
    setOpen?: (open: boolean) => void;
    destroy?: () => void;
}

export interface MinigameDefinition {
    modelId: number;
    l2dName: string;
    framing: {
        mode: SpineFraming;
        placement?: SpinePlacement;
    };
    create: (context: MinigameContext) => Promise<MinigameInstance | undefined>;
}
