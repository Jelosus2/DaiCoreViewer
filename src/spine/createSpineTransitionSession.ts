import type { SpineActionConfig, SpineActionItem, SpineActionTarget, SpineRender, SpineRoot } from "@/types/spine";
import type { EntranceEffects } from "./playSpineEntrance";

import { parseSpineTap, type SpineRoleTransition } from "./parseSpineTap";
import { buildSpineScene } from "./buildSpineScene";
import { createSpineInteractions, createSpineInteractionState } from "./createSpineInteractions";
import { playSpineEntrance } from "./playSpineEntrance";
import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { Container, Ticker } from "pixi.js";

type TrackEntry = ReturnType<Spine["state"]["setAnimation"]>;

interface TransitionSessionOptions {
    initialRender: SpineRender;
    interaction?: SpineActionConfig;
    targets: SpineActionTarget[];
    artLayer: Container;
    overlayLayer: Container;
    hotspotLayer: Container;
    ticker: Ticker;
    cacheKeys: Set<string>;
    showHotspots: boolean;
    loadRoot: (root: SpineRoot) => Promise<void>;
    onSceneChanged: () => void;
    onError: (error: unknown) => void;
    onSpineUIChange?: (open: boolean) => void;
    getGamePortraitScale: () => number;
    shouldPlayEntrance?: () => boolean;
    entranceEffects: EntranceEffects;
    entranceWrapper: Container;
    entranceLayer: Container;
    entranceSkipTarget: HTMLElement;
}

export function createSpineTransitionSession(options: TransitionSessionOptions) {
    const roots = new Map<string, SpineRoot>();
    const rootLoads = new Map<string, Promise<void>>();

    if (options.initialRender.root)
    {
        roots.set(options.initialRender.l2dName, options.initialRender.root);
        rootLoads.set(options.initialRender.l2dName, Promise.resolve());
    }

    for (const target of options.targets)
    {
        if (target.render.status === "ready" && target.render.root && target.render.layerCount === 1)
            roots.set(target.l2dName, target.render.root);
    }

    const state = createSpineInteractionState();
    const itemsByIndex = new Map(options.interaction?.items.map((item) => [item.index, item]));
    const waits = new Set<{ id: ReturnType<typeof setTimeout>; resolve: () => void; }>();
    const entryWaits = new Set<() => void>();
    const sceneNodes = new Map<string, Container>();
    let interactions: ReturnType<typeof createSpineInteractions> | undefined;
    let currentRole = 1;
    let pending = false;
    let destroyed = false;
    let generation = 0;
    let spineUIOpen = false;
    let disposeEntrance: (() => void) | undefined;

    function wait(ms: number): Promise<void> {
        if (destroyed || ms <= 0)
            return Promise.resolve();

        return new Promise((resolve) => {
            const timer = { id: undefined as unknown as ReturnType<typeof setTimeout>, resolve };

            timer.id = setTimeout(() => {
                waits.delete(timer);
                resolve();
            }, ms);

            waits.add(timer);
        });
    }

    function clearWaits() {
        for (const timer of waits)
        {
            clearTimeout(timer.id);
            timer.resolve();
        }

        waits.clear();
    }

    function clearLayer(layer: Container) {
        for (const child of layer.removeChildren())
            child.destroy({ children: true });
    }

    function canTransition(rule: SpineRoleTransition): boolean {
        return roots.has(rule.target) && (!rule.overlay || roots.has(rule.overlay));
    }

    function ensureRootLoaded(name: string): Promise<void> {
        const existing = rootLoads.get(name);
        if (existing)
            return existing;

        const root = roots.get(name);
        if (!root)
            return Promise.reject(new Error(`Spine transition target ${name} is missing`));

        const request = options.loadRoot(root).catch((error: unknown) => {
            rootLoads.delete(name);
            throw error;
        });

        rootLoads.set(name, request);
        return request;
    }

    function mount(root: SpineRoot, role: number, withEntrance = false) {
        disposeEntrance?.();
        disposeEntrance = undefined;

        options.hotspotLayer.visible = true;

        closeSpineUI();

        interactions?.destroy();
        interactions = undefined;

        clearLayer(options.hotspotLayer);
        clearLayer(options.artLayer);

        const scene = buildSpineScene(root, options.artLayer, options.cacheKeys);
        const spines = scene.spines;

        sceneNodes.clear();

        let paths: string[] = [];

        for (const [index, node] of root.nodes.entries())
        {
            const path = node.parent === null
                ? ""
                : [paths[node.parent], node.name].filter(Boolean).join("/");

            paths.push(path);
            sceneNodes.set(path, scene.nodes[index]);
        }

        for (const spine of spines)
            spine.ticker = options.ticker;

        currentRole = role;

        const config = options.interaction;
        const candidates = config && spines.length > 1
            ? spines.filter((candidate) =>
                root.nodes[scene.spineNodes.get(candidate)!].activeInitially &&
                config.items.some((item) =>
                    (parseSpineTap(item, candidate, role)?.animationNames.length ?? 0) > 0 ||
                    parseSpineTap(item, candidate, role)?.drag !== undefined
                )
            )
            : spines;

        if (config && candidates.length === 1)
        {
            interactions = createSpineInteractions(options.hotspotLayer, candidates[0], config, options.showHotspots, {
                role,
                state,
                scene: {
                    ...scene,
                    root,
                    getGamePortraitScale: options.getGamePortraitScale
                },
                canTransition,
                onTransition: beginTransition,
                onSpineUI: options.onSpineUIChange ? toggleSpineUI : undefined
            });
        }

        if (withEntrance)
        {
            const initiallyActive = spines.filter((spine) => root.nodes[scene.spineNodes.get(spine)!].activeInitially);

            disposeEntrance = playSpineEntrance(initiallyActive, {
                ticker: options.ticker,
                wrapper: options.entranceWrapper,
                layer: options.entranceLayer,
                effects: options.entranceEffects,
                skipTarget: options.entranceSkipTarget,
                shouldPlay: options.shouldPlayEntrance ?? (() => false),
                onPlayingChange: (playing) => {
                    interactions?.setEnabled(!playing);
                    options.hotspotLayer.visible = !playing;
                },
                onCenteredChange: () => options.onSceneChanged()
            });
        }

        options.onSceneChanged();
    }

    function trackOf(item: SpineActionItem): number {
        if (item.sType < 6)
            return 1;

        const value = item.content?.trackIndex;
        const index = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;

        return Number.isInteger(index) && index > 0 ? index : item.index;
    }

    function carryRecords(rule: SpineRoleTransition) {
        if (!rule.transfers)
        {
            state.stageSteps.clear();
            state.orderPositions.clear();
            return;
        }

        const previous = new Map(state.stageSteps);

        for (const [sourceIndex, targetIndex] of rule.transfers)
        {
            const source = itemsByIndex.get(sourceIndex);
            const target = itemsByIndex.get(targetIndex);

            if (!source || !target)
                continue;

            const step = previous.get(trackOf(source));

            if (step === undefined)
                state.stageSteps.delete(trackOf(target));
            else
                state.stageSteps.set(trackOf(target), step);
        }
    }

    function waitForEntry(entry: TrackEntry): Promise<void> {
        return new Promise((resolve) => {
            const previous = entry.listener;
            let settled = false;

            const finish = () => {
                if (settled)
                    return;

                settled = true;
                entryWaits.delete(finish);

                resolve();
            };

            entryWaits.add(finish);

            entry.listener = {
                ...previous,
                complete: (completed) => {
                    previous?.complete?.(completed);
                    finish();
                }
            };
        });
    }

    function failTransition(error: unknown, token: number) {
        if (destroyed || token !== generation)
            return;

        generation++;
        pending = false;

        clearLayer(options.overlayLayer);
        interactions?.setEnabled(true);
        options.onError(error);
    }

    function beginTransition(rule: SpineRoleTransition, entry?: TrackEntry) {
        if (pending || destroyed || !canTransition(rule))
            return;

        pending = true;
        interactions?.setEnabled(false);

        const token = ++generation;
        const endAt = performance.now() + rule.durationMs;
        const completion = entry ? waitForEntry(entry) : wait(rule.durationMs / 2);

        if (rule.overlay)
        {
            void wait(endAt - performance.now()).then(() => {
                if (!destroyed && token === generation)
                    clearLayer(options.overlayLayer);
            });

            const overlayRoot = roots.get(rule.overlay)!;
            void ensureRootLoaded(rule.overlay).then(() => {
                if (destroyed || token !== generation || performance.now() >= endAt)
                    return;

                clearLayer(options.overlayLayer);

                const { spines } = buildSpineScene(overlayRoot, options.overlayLayer, options.cacheKeys);

                for (const spine of spines)
                    spine.ticker = options.ticker;
            }).catch((error: unknown) => {
                failTransition(error, token);
            });
        }

        void Promise.all([ensureRootLoaded(rule.target), completion]).then(async () => {
            if (destroyed || token !== generation)
                return;

            carryRecords(rule);
            mount(roots.get(rule.target)!, rule.role);

            if (rule.followUp)
                interactions?.triggerByIndex(rule.followUp);

            if (rule.overlay)
            {
                interactions?.setEnabled(false);
                await wait(endAt - performance.now());
            }

            if (destroyed || token !== generation)
                return;

            clearLayer(options.overlayLayer);
            interactions?.setEnabled(true);

            pending = false;
        }).catch((error: unknown) => {
            failTransition(error, token);
        });
    }

    function closeSpineUI() {
        if (!spineUIOpen)
            return;

        spineUIOpen = false;
        options.onSpineUIChange?.(false);
    }

    function toggleSpineUI() {
        spineUIOpen = !spineUIOpen;
        options.onSpineUIChange?.(spineUIOpen);
    }

    return {
        async preloadTransitions() {
            await Promise.all([...roots.keys()].map(ensureRootLoaded));
        },
        mountInitial() {
            if (!options.initialRender.root)
                throw new Error("Initial Spine root is missing");

            mount(options.initialRender.root, currentRole, true);
        },
        setDebugVisible(visible: boolean) {
            options.showHotspots = visible;
            interactions?.setDebugVisible(visible);
        },
        destroy() {
            destroyed = true;

            disposeEntrance?.();
            disposeEntrance = undefined;

            closeSpineUI();

            generation++;
            clearWaits();

            for (const finish of entryWaits)
                finish();

            entryWaits.clear();
            sceneNodes.clear();

            interactions?.destroy();
            interactions = undefined;

            clearLayer(options.hotspotLayer);
            clearLayer(options.overlayLayer);
            clearLayer(options.artLayer);
        },
        getSceneNode(path: string): Container | undefined {
            return destroyed ? undefined : sceneNodes.get(path);
        },
        triggerByIndex(index: number, onComplete?: () => void): boolean {
            return interactions?.triggerByIndex(index, true, onComplete) ?? false
        },
        getStagedAction(index: number) {
            return destroyed ? undefined : interactions?.getStagedAction(index);
        },
        isIdle(): boolean {
            return interactions?.isIdle() ?? false;
        }
    };
}
