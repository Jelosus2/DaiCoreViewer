import { Spine, RegionAttachment } from "@esotericsoftware/spine-pixi-v8";
import { Container, Graphics, Point, Polygon, UPDATE_PRIORITY } from "pixi.js";

export interface SpineSlotHotspot {
    slotName: string;
    hitbox: Container;
    outline: Graphics;
}

export function bindSpineSlotHotspots(layer: Container, spine: Spine, bindings: SpineSlotHotspot[]): () => void {
    const tracked = bindings.map((binding) => {
        const slot = spine.skeleton.findSlot(binding.slotName);
        if (!slot)
            throw new Error(`Missing hotspot slot: ${binding.slotName}`);

        binding.hitbox.position.set(0, 0);
        binding.hitbox.rotation = 0;

        const polygon = new Polygon([]);
        binding.hitbox.hitArea = polygon;
        binding.outline.clear();

        return {
            ...binding,
            slot,
            polygon,
            vertices: new Float32Array(8),
            previous: new Array<number>(8).fill(Number.NaN)
        };
    });

    const local = new Point();
    const global = new Point();
    const point = new Point();

    function update() {
        for (const target of tracked)
        {
            const attachment = target.slot.getAttachment();

            if (!(attachment instanceof RegionAttachment))
            {
                target.polygon.points.length = 0;
                target.outline.clear();
                target.previous.fill(Number.NaN);

                continue;
            }

            attachment.computeWorldVertices(target.slot, target.vertices, 0, 2);

            const points = target.polygon.points;
            let changed = points.length !== 8;

            for (let index = 0; index < 8; index += 2)
            {
                local.set(target.vertices[index], target.vertices[index + 1]);
                spine.toGlobal(local, global);
                layer.toLocal(global, undefined, point);

                points[index] = point.x;
                points[index + 1] = point.y;

                if (point.x !== target.previous[index] || point.y !== target.previous[index + 1])
                    changed = true;
            }

            if (changed)
            {
                target.outline.clear().poly(points, true)
                    .stroke({ color: 0xc7aa83, width: 2 });

                for (let index = 0; index < 8; index++)
                    target.previous[index] = points[index];
            }
        }
    }

    update();
    spine.ticker.add(update, undefined, UPDATE_PRIORITY.NORMAL - 2);

    return () => spine.ticker.remove(update);
}
