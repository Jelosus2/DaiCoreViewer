import type { SpineRoot } from "@/types/spine";
import type { ModelLayerGroup } from "@/types/layers";
import type { BuiltSpineScene } from "@/spine/buildSpineScene";
import type { AttachmentCacheData } from "@esotericsoftware/spine-pixi-v8";

import { MeshAttachment, RegionAttachment } from "@esotericsoftware/spine-pixi-v8";
import { shallowRef } from "vue";

type Choice = { enabled: boolean; hidden: Set<string> };

export function useSpineLayers() {
    const groups = shallowRef<ModelLayerGroup[]>([]);
    const choices = new Map<string, Choice>();
    let bindings: Array<{ refresh: () => ModelLayerGroup; invalidate: () => void; dispose: () => void }> = [];

    function refresh() {
        groups.value = bindings.map((binding) => binding.refresh()).filter((group) => group.slots.length > 0);
    }

    function invalidate() {
        for (const binding of bindings)
            binding.invalidate();

        refresh();
    }

    function mount(root: SpineRoot, scene: BuiltSpineScene) {
        for (const binding of bindings)
            binding.dispose();

        bindings = scene.spines.map((spine, index) => {
            const nodeIndex = scene.spineNodes.get(spine)!;
            const id = JSON.stringify([root.name, nodeIndex, index]);
            const slots = spine.skeleton.slots.flatMap((slot) => {
                const names = new Set<string>();

                for (const skin of spine.skeleton.data.skins)
                {
                    for (const attachment of Object.values(skin.attachments[slot.data.index] ?? {}))
                    {
                        if (attachment instanceof RegionAttachment || attachment instanceof MeshAttachment)
                            names.add(attachment.name);
                    }
                }

                if (names.size === 0)
                    return [];

                const key = JSON.stringify([id, slot.data.name]);
                const choice = choices.get(key) ?? { enabled: true, hidden: new Set<string>() };

                choices.set(key, choice);

                return [{ slot, key, choice, names: [...names].sort() }];
            });

            const bySlot = new Map(slots.map((row) => [row.slot, row.choice]));
            const original = spine._validateAndTransformAttachments;
            let overridden = new Map<AttachmentCacheData, boolean>();

            spine._validateAndTransformAttachments = () => {
                const previous = overridden;

                for (const [data, nativeSkip] of previous)
                    data.skipRender = nativeSkip;

                original.call(spine);
                overridden = new Map();

                for (const [slot, choice] of bySlot)
                {
                    const attachment = slot.getAttachment();
                    if (!(attachment instanceof RegionAttachment || attachment instanceof MeshAttachment) || (choice.enabled && !choice.hidden.has(attachment.name)))
                        continue;

                    const data = spine._getCachedData(slot, attachment);
                    if (!previous.has(data) && !data.skipRender)
                        spine.spineAttachmentsDirty = true;

                    overridden.set(data, data.skipRender);
                    data.skipRender = true;
                }

                for (const [data] of previous)
                {
                    if (!data.skipRender)
                        spine.spineAttachmentsDirty = true;
                }
            };

            return {
                refresh: () => ({
                    id,
                    name: spine.skeleton.data.name || root.nodes[nodeIndex].name,
                    slots: slots.map(({ slot, key, choice, names }) => ({
                        id: key,
                        name: slot.data.name,
                        enabled: choice.enabled,
                        attachments: names.map((name) => ({ name, enabled: !choice.hidden.has(name) }))
                    }))
                }),
                invalidate: () => {
                    if (!spine.destroyed)
                        spine.update(0);
                },
                dispose: () => {
                    if (!spine.destroyed)
                    {
                        for (const [data, nativeSkip] of overridden)
                            data.skipRender = nativeSkip;

                        spine._validateAndTransformAttachments = original;
                        spine.spineAttachmentsDirty = true;
                    }

                    overridden.clear();
                }
            };
        });

        refresh();
    }

    return {
        groups,
        mount,
        setSlot(id: string, enabled: boolean) {
            const choice = choices.get(id);
            if (!choice)
                return;

            choice.enabled = enabled;
            invalidate();
        },
        setAttachment(id: string, name: string, enabled: boolean) {
            const choice = choices.get(id);
            if (!choice)
                return;

            if (enabled)
                choice.hidden.delete(name);
            else
                choice.hidden.add(name);

            invalidate();
        },
        reset() {
            for (const choice of choices.values())
            {
                choice.enabled = true;
                choice.hidden.clear();
            }

            invalidate();
        },
        destroy() {
            for (const binding of bindings)
                binding.dispose();

            bindings = [];
            choices.clear();
            groups.value = [];
        }
    };
}
