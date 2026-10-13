import { Spine, RegionAttachment } from "@esotericsoftware/spine-pixi-v8";
import { Container, Point, Polygon, UPDATE_PRIORITY } from "pixi.js";

export interface SpineSlotHotspot {
    slotName: string;
    hitbox: Container;
    marker: Container;
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

        return { ...binding, slot, polygon, vertices: new Float32Array(8) };
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
                continue;
            }

            attachment.computeWorldVertices(target.slot, target.vertices, 0, 2);

            const points = target.polygon.points;
            let centerX = 0;
            let centerY = 0;

            for (let index = 0; index < 8; index += 2)
            {
                local.set(target.vertices[index], target.vertices[index + 1]);
                spine.toGlobal(local, global);
                layer.toLocal(global, undefined, point);

                points[index] = point.x;
                points[index + 1] = point.y;
                centerX += point.x;
                centerY += point.y;
            }

            target.marker.position.set(centerX / 4, centerY / 4);
        }
    }

    update();
    spine.ticker.add(update, undefined, UPDATE_PRIORITY.NORMAL - 2);

    return () => spine.ticker.remove(update);
}
