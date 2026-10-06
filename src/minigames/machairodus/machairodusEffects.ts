import { Container, Sprite, Texture } from "pixi.js";

export function createMachairodusSpark(streakTexture: Texture, flareTexture: Texture) {
    const view = new Container();
    const flare = new Sprite(flareTexture);

    flare.anchor.set(0.5);
    flare.blendMode = "add";
    flare.tint = 0xffd47a;

    view.addChild(flare);

    const rays = Array.from({ length: 36 }, (_, index) => {
        const sprite = new Sprite(streakTexture);
        const angle = index * Math.PI / 18 + ((index * 17) % 11 - 5) * 0.025;

        sprite.anchor.set(0, 0.5);
        sprite.rotation = angle;
        sprite.blendMode = "add";
        sprite.tint = index % 3 === 0 ? 0xffffff : 0xffca70;
        sprite.width = 48 + index % 5 * 12;
        sprite.height = 7 + index % 3 * 2;

        view.addChild(sprite);

        return {
            sprite,
            angle,
            reach: 110 + (index * 37) % 100
        };
    });

    return {
        view,
        update(age: number) {
            view.visible = age >= 1 / 60 && age < 0.4;
            if (!view.visible)
                return;

            const time = age - 1 / 60;
            const travel = Math.min(1, time / 0.18);
            const fade = time <= 0.16
                ? 1
                : Math.max(0, 1 - (time - 0.16) / 0.22);
            const flareSize = 500 * (0.75 + 0.25 * travel);

            flare.width = flareSize;
            flare.height = flareSize;
            flare.alpha = 0.75 * fade;

            for (const ray of rays)
            {
                const distance = ray.reach * travel;

                ray.sprite.position.set(Math.cos(ray.angle) * distance, Math.sin(ray.angle) * distance);
                ray.sprite.alpha = fade * (ray.sprite.tint === 0xffffff ? 1 : 0.8);
            }
        }
    }
}
