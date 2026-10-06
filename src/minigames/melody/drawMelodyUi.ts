import type { MelodyImage, MelodyImages, MelodyUi } from "./melodyAssets";
import type { MelodyMinigameView } from "./createMelodyMinigame";

interface Texture {
    width: number;
    height: number;
    pixels: Uint8ClampedArray;
    repeat: boolean;
}

interface Particle {
    wave: boolean;
    slot: number;
    x: number;
    y: number;
    size: number;
    speed: number;
    lifetime: number;
    birth: number;
    simulationSpeed: number;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const random = (min: number, max: number) => min + Math.random() * (max - min);

const sizeKeys = [
    {
        time: 0,
        value: 0,
        slope: 6.82981348,
        incoming: 0,
        outgoing: 0.27641952
    },
    {
        time: 0.377591848,
        value: 1,
        slope: -0.017847953,
        incoming: 1 / 3,
        outgoing: 0.246564895
    },
    {
        time: 0.999023438,
        value: 0,
        slope: -5.88165426,
        incoming: 0.238980889,
        outgoing: 0
    }
];

export function createMelodyUiPainter(canvas: HTMLCanvasElement, ui: MelodyUi, images: MelodyImages) {
    const context = canvas.getContext("2d")!;
    if (!context)
        throw new Error("Melody UI requires Canvas 2D");

    const lossEffects = createMelodyLossEffects(ui, images);

    let previousPhase = "";
    let previousAge = 0;

    function sprite(name: string, x: number, y: number, width: number, height: number, opacity = 1) {
        const image = images.get(name);
        if (!image)
            throw new Error(`Melody image ${name} was not prepared`);

        context.save();
        context.globalAlpha *= clamp(opacity);
        context.drawImage(image, x, y, width, height);
        context.restore();
    }

    function item(image: MelodyImage, opacity = 1, name = image.sprite) {
        context.save();

        const [a, b, c, d, e, f] = image.matrix;
        context.transform(a, b, c, d, e, f);

        sprite(name, image.x, image.y, image.width, image.height, image.opacity * opacity);
        context.restore();
    }

    return {
        draw(view: MelodyMinigameView) {
            const width = canvas.clientWidth;
            const height = canvas.clientHeight;
            const ratio = Math.min(2, window.devicePixelRatio || 1);
            const pixelWidth = Math.max(1, Math.round(width * ratio));
            const pixelHeight = Math.max(1, Math.round(height * ratio));

            if (canvas.width !== pixelWidth || canvas.height !== pixelHeight)
            {
                canvas.width = pixelWidth;
                canvas.height = pixelHeight;
            }

            context.setTransform(1, 0, 0, 1, 0, 0);
            context.clearRect(0, 0, canvas.width, canvas.height);

            if (width <= 0 || height <= 0 || view.phase === "stopped")
            {
                previousPhase = "";
                lossEffects.clear();
                return;
            }

            const scale = Math.min(width / 1920, height / 1080);
            context.setTransform(ratio * scale, 0, 0, ratio * scale, pixelWidth / 2, pixelHeight / 2);

            for (let index = 1; index <= view.cardHp; index++)
                sprite("img_04_01", 807.9 - (view.cardHp - index) * 88.67, -504, 100, 84);

            for (let index = 1; index <= view.playerHp; index++)
                sprite("img_04_02", 807.9 - (view.playerHp - index) * 88.67, -408.7, 100, 84);

            if (view.phase === "choose")
            {
                const opacity = clamp((view.age - 0.001) / 0.3);

                for (const image of ui.selection)
                    item(image, opacity);

                context.save();
                context.globalAlpha = opacity;
                context.fillStyle = "white";
                context.textAlign = "center";
                context.font = "bold 36px system-ui";
                context.fillText("Choose your hand", 0, 143);
                context.restore();

                sprite("img_exit", -913.7, -508.4, 216, 80);
            }
            else if (view.phase === "reveal")
            {
                item(ui.hand, clamp((view.age - 1.8) / 0.3), `img_01_0${view.choice}`);
            }
            else if (view.phase === "result")
            {
                sprite(
                    "img_05_01",
                    -width / scale / 2,
                    -height / scale / 2,
                    width / scale,
                    height / scale,
                    0.698039
                );

                const sample = Math.min(ui.loss.length - 1, Math.floor(view.age * ui.fps));
                const lossFrame = ui.loss[sample];

                if (view.outcome === "lose")
                {
                    if (previousPhase !== "result" || view.age < previousAge)
                        lossEffects.reset();

                    lossEffects.drawBackdrop(
                        context,
                        -width / scale / 2,
                        -height / scale / 2,
                        width / scale,
                        height / scale,
                        lossFrame.backgroundAlpha
                    );
                    lossEffects.drawParticles(context, view.age, false);
                }

                const frames = ui.results[view.outcome];
                const frame = Math.min(frames.length - 1, Math.floor(view.age * ui.fps));

                for (const image of frames[frame] ?? [])
                    item(image, view.outcome === "lose" ? lossFrame.textAlpha : 1);

                if (view.outcome === "lose")
                    lossEffects.drawParticles(context, view.age, true, lossFrame.textAlpha);
            }

            previousPhase = view.phase;
            previousAge = view.age;
        },
        destroy() {
           lossEffects.clear();
            previousPhase = "";

            context.setTransform(1, 0, 0, 1, 0, 0);
            context.clearRect(0, 0, canvas.width, canvas.height);
            lossEffects.destroy();
        }
    }
}

function createMelodyLossEffects(ui: MelodyUi, images: MelodyImages) {
    const read = (name: string, repeat = false): Texture => {
        const image = images.get(name);
        if (!image)
            throw new Error(`Melody effect texture ${name} is missing`);

        return texture(image, repeat);
    };

    const backdrop = material(
        read("lossNoise", true),
        read("lossDistortion", true),
        read("lossMask", true),
        [0.16264686, 0.17384993, 0.40566039],
        0.5,
        1,
        [0, 0.5, 1, 1],
        192
    );

    const lineTexture = read("lossLines");
    const lineNoise = read("lineDistortion", true);
    const dropTexture = read("lossDrop");

    const makeLines = () => material(
        lineTexture,
        lineNoise,
        undefined,
        [1.075911522, 1.075911522, 1.075911522],
        1,
        0.48,
        [-0.3, 0, 0, 1.11],
        192,
        true
    );

    const makeDrop = () => material(
        dropTexture,
        undefined,
        undefined,
        [1.075911522, 1.075911522, 1.075911522],
        1,
        1,
        [0, 0, 0, 0],
        96
    );

    const shaders = [makeLines(), makeLines(), makeDrop(), makeDrop()];
    let particles: Particle[] = [];

    return {
        reset() {
            particles = [];

            const emit = (wave: boolean, delay: number, rate: number, simulationSpeed: number, capacity: number) => {
                const own: Particle[] = [];

                for (let n = 1; ; n++)
                {
                    const birth = (delay + n / rate) / simulationSpeed;
                    if (birth >= 2)
                        break;

                    const alive = own.filter((particle) => (birth - particle.birth) * simulationSpeed < particle.lifetime).length;
                    if (alive >= capacity)
                        continue;

                    const left = wave && delay > 0;
                    const pose = ui.loss[Math.min(ui.loss.length - 1, Math.round(birth * ui.fps))];
                    const particle: Particle = {
                        wave,
                        slot: wave ? (left ? 0 : 1) : 2 + own.length,
                        x: wave
                            ? (left
                                ? -588 + random(-255.7, 255.7)
                                : 610 + random(-191.45, 191.45))
                            : -10.7 + random(-191.45, 191.45),
                        y: wave
                            ? (left ? -280 : -286) + random(-150, 150)
                            : -88.3 + pose.textY,
                        size: wave ? (left ? 360 : 279.9) : random(64, 128),
                        speed: wave
                            ? (left ? random(8, 20) : random(5, 15))
                            : 25,
                        lifetime: wave
                            ? (left ? random(5, 12) : random(3, 8))
                            : random(6, 8),
                        birth,
                        simulationSpeed
                    };

                    own.push(particle);
                    particles.push(particle);
                }
            };

            emit(true, 0.5, 1, 1, 1);
            emit(true, 0, 1, 1, 1);
            emit(false, 0.5, 0.5, 5, 2);
        },
        drawBackdrop(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, opacity: number) {
            context.save();
            context.globalAlpha *= clamp(opacity);
            context.drawImage(backdrop.render(performance.now() / 1000, 1), x, y, width, height);
            context.restore();
        },
        drawParticles(context: CanvasRenderingContext2D, seconds: number, drops: boolean, groupAlpha = 1) {
            for (const particle of particles)
            {
                if (drops === particle.wave)
                    continue;

                const age = (seconds - particle.birth) * particle.simulationSpeed;
                if (age <= 0 || age >= particle.lifetime)
                    continue;

                const life = age / particle.lifetime;
                const fade = Math.min(clamp(life / 0.244114), clamp((1 - life) / 0.250004));
                const size = particle.size * (particle.wave ? 1 : dropSize(life));
                const image = shaders[particle.slot].render(performance.now() / 1000, fade * (drops ? groupAlpha : 1));

                context.save();
                context.translate(particle.x, particle.y + age * particle.speed);

                if (particle.wave)
                    context.rotate(Math.PI / 2);

                context.drawImage(image, -size / 2, -size / 2, size, size);
                context.restore();
            }
        },
        clear() {
            particles = [];
        },
        destroy() {
            particles = [];
            backdrop.destroy();

            for (const shader of shaders)
                shader.destroy();
        }
    }
}

function texture(image: HTMLImageElement, repeat: boolean): Texture {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const result: Texture = {
        width: canvas.width,
        height: canvas.height,
        pixels,
        repeat
    };

    canvas.width = canvas.height = 0;
    return result;
}

function material(
    main: Texture,
    noise: Texture | undefined,
    mask: Texture | undefined,
    color: number[],
    tintAlpha: number,
    alphaScale: number,
    scroll: number[],
    resolution: number,
    columnNoise = false
) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = resolution;

    const context = canvas.getContext("2d")!;
    const frame = context.createImageData(resolution, resolution);
    const texel = new Float64Array(4);
    const distortion = new Float64Array(4);
    const maskTexel = new Float64Array(4);
    const maskPixels = mask
        ? new Float32Array(resolution * resolution * 4)
        : undefined;

    if (mask && maskPixels)
    {
        for (let row = 0; row < resolution; row++)
        {
            for (let column = 0; column < resolution; column++)
            {
                sample(mask, (column + 0.5) / resolution, -(1 - (row + 0.5) / resolution), maskTexel);
                maskPixels.set(maskTexel, (row * resolution + column) * 4);
            }
        }
    }

    const offsets = new Float64Array(resolution * 2);
    let previousKey = "";

    return {
        render(seconds: number, opacity: number): HTMLCanvasElement {
            const tick = noise ? Math.floor(seconds * 24) : 0;
            const alpha = Math.round(clamp(opacity) * 32) / 32;
            const key = `${tick}:${alpha}`;

            if (key === previousKey)
                return canvas;

            previousKey = key;
            seconds = tick / 24;

            if (noise && columnNoise)
            {
                for (let column = 0; column < resolution; column++)
                {
                    sample(noise, (column + 0.5) / resolution + seconds * scroll[0], 0.5, distortion);

                    offsets[column * 2] = distortion[0] * 0.05 * scroll[2];
                    offsets[column * 2 + 1] = distortion[1] * 0.05 * scroll[3];
                }
            }

            for (let row = 0; row < resolution; row++)
            {
                const v = 1 - (row + 0.5) / resolution;

                for (let column = 0; column < resolution; column++)
                {
                    const u = (column + 0.5) / resolution;
                    let du = 0;
                    let dv = 0;

                    if (noise && columnNoise)
                    {
                        du = offsets[column * 2];
                        dv = offsets[column * 2 + 1];
                    }
                    else if (noise)
                    {
                        sample(noise, u + seconds * scroll[0], v + seconds * scroll[1], distortion);

                        du = distortion[0] * 0.05 * scroll[2];
                        dv = distortion[1] * 0.05 * scroll[3];
                    }

                    sample(main, u + du, v + dv, texel);

                    const pixel = (row * resolution + column) * 4;

                    for (let channel = 0; channel < 4; channel++)
                        maskTexel[channel] = maskPixels ? maskPixels[pixel + channel] : 1;

                    for (let channel = 0; channel < 3; channel++)
                        frame.data[pixel + channel] = texel[channel] * color[channel] * maskTexel[channel] * 255;

                    frame.data[pixel + 3] = clamp(
                        clamp(2 * tintAlpha * alpha * texel[3]) * texel[3] * alphaScale * maskTexel[0] * maskTexel[3]
                    ) * 255;
                }
            }

            context.putImageData(frame, 0, 0);
            return canvas;
        },
        destroy() {
            canvas.width = canvas.height = 0;
        }
    };
}

function address(value: number, size: number, repeat: boolean) {
    return repeat
        ? ((value % size) + size) % size
        : Math.max(0, Math.min(size - 1, value));
}

function sample(texture: Texture, u: number, v: number, result: Float64Array) {
    const x = u * texture.width - 0.5;
    const y = (1 - v) * texture.height - 0.5;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;

    const x0 = address(ix, texture.width, texture.repeat);
    const x1 = address(ix + 1, texture.width, texture.repeat);
    const y0 = address(iy, texture.height, texture.repeat);
    const y1 = address(iy + 1, texture.height, texture.repeat);

    for (let channel = 0; channel < 4; channel++)
    {
        const a = texture.pixels[(y0 * texture.width + x0) * 4 + channel];
        const b = texture.pixels[(y0 * texture.width + x1) * 4 + channel];
        const c = texture.pixels[(y1 * texture.width + x0) * 4 + channel];
        const d = texture.pixels[(y1 * texture.width + x1) * 4 + channel];

        result[channel] = ((a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy) / 255;
    }
}

function dropSize(time: number): number {
    if (time <= 0 || time >= sizeKeys[2].time)
        return 0;

    const index = time < sizeKeys[1].time ? 0 : 1;
    const a = sizeKeys[index];
    const b = sizeKeys[index + 1];
    const span = b.time - a.time;
    const position = (time - a.time) / span;

    const cubic = (p0: number, p1: number, p2: number, p3: number, t: number) => {
        const s = 1 - t;

        return s * s * s * p0 +
            3 * s * s * t * p1 +
            3 * s * t * t * p2 +
            t * t * t * p3;
    };

    let low = 0;
    let high = 1;

    for (let iteration = 0; iteration < 16; iteration++)
    {
        const t = (low + high) / 2;

        if (cubic(0, a.outgoing, 1 - b.incoming, 1, t) < position)
            low = t;
        else
            high = t;
    }

    return Math.max(0, cubic(
        a.value,
        a.value + a.slope * span * a.outgoing,
        b.value - b.slope * span * b.incoming,
        b.value,
        (low + high) / 2
    ));
}
