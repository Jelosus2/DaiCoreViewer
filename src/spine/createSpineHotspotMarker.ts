import type { ParsedSpineTap } from "./parseSpineTap";

import { Container, Graphics, Matrix, Polygon } from "pixi.js";

export function createSpineHotspotMarker(action: ParsedSpineTap) {
    const marker = new Graphics()
        .circle(0, 0, 18).fill({ color: 0x000000, alpha: 0.35 })
        .circle(0, 0, 15).fill({ color: 0x20242b, alpha: 0.8 })
        .stroke({ color: 0xffffff, width: 1.5, alpha: 0.9 });

    marker.eventMode = "none";

    const stroke = {
        color: 0xffffff,
        width: 2,
        cap: "round" as const,
        join: "round" as const
    };

    if (action.asmrId !== undefined)
    {
        marker.circle(0, 0, 9).stroke(stroke)
            .circle(0, 0, 3).fill(0xffffff)
            .arc(0, 0, 6, -Math.PI / 2, 0).stroke(stroke);
    }
    else if (action.spineUI)
    {
        marker.poly([-3, -7, 7, 0, -3, 7], true).fill(0xffffff);
    }
    else if (action.gesture)
    {
        const direction = action.gesture.direction;
        const angle = direction === 1 ? Math.PI : direction === 2 ? 0 : direction === 3 ? -Math.PI / 2 : Math.PI / 2;
        const point = (x: number, y: number) => [
            x * Math.cos(angle) - y * Math.sin(angle),
            x * Math.sin(angle) + y * Math.cos(angle)
        ] as const;

        marker.moveTo(...point(-7, 0)).lineTo(...point(7, 0)).moveTo(...point(2, -5)).lineTo(...point(7, 0)).lineTo(...point(2, 5)).stroke(stroke);
    }
    else if (action.drag)
    {
        marker.moveTo(-8, 0).lineTo(8, 0).moveTo(0, -8).lineTo(0, 8)
            .moveTo(-5, -3).lineTo(-8, 0).lineTo(-5, 3)
            .moveTo(5, -3).lineTo(8, 0).lineTo(5, 3)
            .moveTo(-3, -5).lineTo(0, -8).lineTo(3, -5)
            .moveTo(-3, 5).lineTo(0, 8).lineTo(3, 5).stroke(stroke);
    }
    else
    {
        marker.circle(0, 0, 6).stroke(stroke).circle(0, 0, 2).fill(0xffffff);
    }

    const transform = new Matrix();

    function update(hitbox: Container) {
        hitbox.getGlobalTransform(transform);

        const { a, b, c, d } = transform;
        const determinant = a * d - b * c;

        marker.renderable = Number.isFinite(determinant) && Math.abs(determinant) > 1e-8 &&
            (!(hitbox.hitArea instanceof Polygon) || hitbox.hitArea.points.length > 0);

        if (!marker.renderable)
            return;

        transform.set(d / determinant, -b / determinant, -c / determinant, a / determinant, marker.x, marker.y);
        marker.setFromMatrix(transform);
    }

    return { marker, update };
}
