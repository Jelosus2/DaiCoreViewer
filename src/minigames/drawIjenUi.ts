import type { IjenAssets, IjenParticle, IjenTransform, IjenUi } from "./ijenAssets";
import type { IjenMinigameView } from "./createIjenMinigame";

type Matrix = [number, number, number, number, number, number];

interface Layout extends IjenTransform { matrix: Matrix }

interface Particle {
    birth: number;
    lifetime: number;
    matrix: Matrix;
    x: number;
    y: number;
    size: number;
    rotation: number;
    rotationRate: number;
    gradient: number;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const random = (range: number[]) => range[0] + Math.random() * (range[1] - range[0]);

export function layoutIjenUi(ui: IjenUi, view: IjenMinigameView, width: number, height: number): Layout[] {
    const poses: IjenTransform[] = ui.nodes.map(node => ({ ...node }));

    for (const clip of ui.animations)
    {
        let time = view.age % clip.duration;
        let weight = 1;

        if (!clip.loop)
        {
            time = Math.min(view.shakeAge, clip.duration);
            const exit = clip.duration * (clip.exitTime ?? 1);
            weight = Math.min(clamp(view.shakeAge / (clip.blendIn ?? 1)), clamp(1 - (view.shakeAge - exit) / (clip.blendOut ?? 1)));

            if (!Number.isFinite(time) || weight <= 0)
                continue;
        }
        for (const track of clip.tracks)
        {
            const values = sample(track.frames, time, ui.fps);
            const pose = poses[track.node];
            const property = track.property;

            if (property === "scale" || property === "euler")
                pose[property] = values.map((value, i) => pose[property][i] + (value - pose[property][i]) * weight);
            else
                pose[property] += (values[0] - pose[property]) * weight;
        }
    }

    poses[ui.bindings.waves].y = 660 + view.progress * 1000;
    poses[ui.bindings.arrow].y = view.arrow;

    const result: Layout[] = [];

    for (let index = 0; index < ui.nodes.length; index++)
    {
        const node = ui.nodes[index], pose = poses[index];
        const parent = result[node.parent];

        if (!parent)
        {
            result.push({ ...pose, width, height, matrix: [1, 0, 0, 1, pose.x, -pose.y] });
            continue;
        }

        const parentPivot = ui.nodes[node.parent].pivot;
        const x = pose.x + parent.width * ((node.anchorMin[0] + node.anchorMax[0]) / 2 - parentPivot[0]);
        const y = -pose.y - parent.height * ((node.anchorMin[1] + node.anchorMax[1]) / 2 - parentPivot[1]);
        const [rx, ry, rz] = pose.euler.map(value => value * Math.PI / 180);
        const cz = Math.cos(rz), sz = Math.sin(rz), cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
        const local: Matrix = [(cy*cz+sy*sx*sz)*pose.scale[0], -cx*sz*pose.scale[0],
                              (cy*sz-sy*sx*cz)*pose.scale[1], cx*cz*pose.scale[1], x, y];

        result.push({ ...pose, width: pose.width + parent.width*(node.anchorMax[0]-node.anchorMin[0]),
                      height: pose.height + parent.height*(node.anchorMax[1]-node.anchorMin[1]),
                      matrix: multiply(parent.matrix, local) });
    }

    return result;
}

export function createIjenUiPainter(canvas: HTMLCanvasElement, assets: IjenAssets) {
    const context = canvas.getContext("2d");
    if (!context)
        throw new Error("Ijen UI requires Canvas 2D");

    const { ui, images } = assets;
    const children = ui.nodes.map(() => [] as number[]);

    ui.nodes.forEach((node, i) => {
        if (node.parent >= 0)
            children[node.parent].push(i);
    });

    const layers = new Map<number, HTMLCanvasElement>();
    const particleTextures = new Map<string, HTMLCanvasElement>();
    const pools = new Map<number, { time: number; rateIndex: number; burstCycle: number; particles: Particle[] }>();
    const warps = new Map<number, ReturnType<typeof createWaterDistortion>>();

    for (let index = 0; index < ui.nodes.length; index++)
    {
        const node = ui.nodes[index];

        if (node.distortion && node.image?.sprite)
            warps.set(index, createWaterDistortion(images.get(node.image.sprite)!, images.get(node.distortion.texture)!, node.distortion));

        if (node.particle?.blend === "source-over")
        {
            const name = node.particle.texture, image = images.get(name)!;
            const texture = document.createElement("canvas");

            texture.width = image.naturalWidth;
            texture.height = image.naturalHeight;

            const ctx = texture.getContext("2d")!;
            ctx.drawImage(image, 0, 0);

            const data = ctx.getImageData(0, 0, texture.width, texture.height);

            for (let pixel = 3; pixel < data.data.length; pixel += 4)
                data.data[pixel] = data.data[pixel] * data.data[pixel] / 255;

            ctx.putImageData(data, 0, 0);
            particleTextures.set(name, texture);
        }
    }

    let previousAge = -1;

    function emit(config: IjenParticle, particles: Particle[], birth: number, matrix: Matrix) {
        if (particles.filter(particle => birth - particle.birth < particle.lifetime).length >= config.capacity)
            return;

        const angle = Math.random() * Math.PI * 2;
        const radius = Math.sqrt(Math.random()) * config.shape.radius;
        const box = config.shape.type === 5;

        particles.push({
            birth,
            lifetime: random(config.lifetime),
            matrix: [...matrix],
            x: box ? (Math.random() - 0.5) * config.shape.size[0] : Math.cos(angle) * radius * config.shape.size[0],
            y: box ? (Math.random() - 0.5) * config.shape.size[1] : Math.sin(angle) * radius * config.shape.size[1],
            size: random(config.size),
            rotation: random(config.rotation),
            rotationRate: random(config.rotationRate),
            gradient: Math.random()
        });
    }

    function particles(index: number, config: IjenParticle, age: number, layout: Layout[]) {
        let pool = pools.get(index);

        if (!pool)
        {
            pool = { time: 0, rateIndex: 1, burstCycle: 0, particles: [] };
            pools.set(index, pool);
        }

        const end = age * config.speed + (config.prewarm ? config.duration : 0);

        while (true)
        {
            const rateTime = config.rate > 0 ? pool.rateIndex / config.rate : Infinity;
            const burstTime = config.bursts.length ? config.bursts[0].time + pool.burstCycle * config.duration : Infinity;
            const time = Math.min(rateTime, burstTime);

            if (time > end)
                break;

            const count = rateTime <= burstTime ? 1 : config.bursts[0].count;
            if (rateTime <= burstTime)
                pool.rateIndex++;
            else
                pool.burstCycle++;

            pool.particles = pool.particles.filter(particle => time - particle.birth < particle.lifetime);

            for (let n = 0; n < count; n++)
                emit(config, pool.particles, time, layout[index].matrix);
        }

        pool.time = end;
        pool.particles = pool.particles.filter(particle => end - particle.birth < particle.lifetime);

        return pool;
    }

    return {
        draw(view: IjenMinigameView) {
            const width = canvas.clientWidth, height = canvas.clientHeight;
            const ratio = Math.min(2, window.devicePixelRatio || 1);
            const pixelWidth = Math.max(1, Math.round(width * ratio)), pixelHeight = Math.max(1, Math.round(height * ratio));

            if (canvas.width !== pixelWidth || canvas.height !== pixelHeight)
            {
                canvas.width = pixelWidth;
                canvas.height = pixelHeight;
            }

            context.setTransform(1, 0, 0, 1, 0, 0);
            context.clearRect(0, 0, canvas.width, canvas.height);

            if (!view.visible || width <= 0 || height <= 0)
            {
                pools.clear();
                previousAge = -1;
                return;
            }
            if (view.age < previousAge)
                pools.clear();

            previousAge = view.age;

            const scale = Math.min(width / 1920, height / 1080);
            const base: Matrix = [scale*ratio, 0, 0, scale*ratio, pixelWidth / 2, pixelHeight / 2];
            const layout = layoutIjenUi(ui, view, width / scale, height / scale);

            function draw(index: number, target: CanvasRenderingContext2D) {
                const node = ui.nodes[index], pose = layout[index];
                if (!node.active)
                    return;

                const matrix = multiply(base, pose.matrix);

                target.save();
                target.setTransform(...matrix);

                const x = -pose.width * node.pivot[0], y = -pose.height * (1 - node.pivot[1]);

                if (node.mask)
                {
                    let layer = layers.get(index);

                    if (!layer)
                    {
                        layer = document.createElement("canvas");
                        layers.set(index, layer);
                    }

                    if (layer.width !== pixelWidth || layer.height !== pixelHeight)
                    {
                        layer.width = pixelWidth;
                        layer.height = pixelHeight;
                    }

                    const masked = layer.getContext("2d")!;
                    masked.setTransform(1, 0, 0, 1, 0, 0);
                    masked.clearRect(0, 0, pixelWidth, pixelHeight);

                    for (const child of children[index])
                        draw(child, masked);

                    masked.setTransform(...matrix);
                    masked.globalCompositeOperation = "destination-in";
                    masked.drawImage(images.get(node.image!.sprite!)!, x, y, pose.width, pose.height);
                    masked.globalCompositeOperation = "source-over";

                    target.setTransform(1, 0, 0, 1, 0, 0);
                    target.drawImage(layer, 0, 0);
                    target.restore();

                    return;
                }

                if (node.image)
                {
                    let name = node.image.sprite;

                    if (index === ui.bindings.txtNum1)
                        name = `img_01_0${Math.floor(view.remaining / 10)}`;

                    if (index === ui.bindings.txtNum2)
                        name = `img_01_0${view.remaining % 10}`;

                    const color = node.image.color;
                    target.globalAlpha = clamp(color[3]);

                    if (name)
                    {
                        target.drawImage(warps.get(index)?.render(view.age) ?? images.get(name)!, x, y, pose.width, pose.height);
                    }
                    else
                    {
                        target.fillStyle = `rgb(${color.slice(0, 3).map(value => Math.round(value * 255)).join(",")})`;
                        target.fillRect(x, y, pose.width, pose.height);
                    }
                }

                if (node.particle)
                {
                    const config = node.particle, pool = particles(index, config, view.age, layout);

                    for (const particle of pool.particles)
                    {
                        const age = pool.time - particle.birth, life = age / particle.lifetime;
                        const size = particle.size * sizeSample(config.sizeCurve, life);
                        const sizeY = config.sizeY === null ? size : config.sizeY * sizeSample(config.sizeYCurve!, life);
                        const alpha = config.alpha ? alphaSample(config.alpha[0], life)*(1-particle.gradient) + alphaSample(config.alpha[1], life)*particle.gradient : 1;

                        target.save();
                        target.setTransform(...multiply(base, particle.matrix));
                        target.translate(particle.x, particle.y - age * config.velocityY);
                        target.rotate(-particle.rotation - age * particle.rotationRate);
                        target.globalAlpha = clamp(alpha);
                        target.globalCompositeOperation = config.blend;
                        target.drawImage(particleTextures.get(config.texture) ?? images.get(config.texture)!, -size / 2, -sizeY / 2, size, sizeY);
                        target.restore();
                    }
                }

                target.restore();

                for (const child of children[index])
                    draw(child, target);
            }
            draw(0, context);
        },
        destroy() {
            pools.clear();

            for (const layer of layers.values())
                layer.width = layer.height = 0;

            layers.clear();

            for (const warp of warps.values())
                warp.destroy();

            warps.clear();

            for (const texture of particleTextures.values())
                texture.width = texture.height = 0;

            particleTextures.clear();

            canvas.width = canvas.height = 0;
        }
    };
}

function multiply(a: Matrix, b: Matrix): Matrix {
    return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
            a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}

function sample(frames: number[][], age: number, fps: number): number[] {
    const index = Math.max(0, Math.min(frames.length - 1, age * fps));
    const a = frames[Math.floor(index)];
    const b = frames[Math.min(frames.length - 1, Math.floor(index) + 1)];

    return a.map((value, i) => value + (b[i] - value) * (index % 1));
}

function sizeSample(curve: number[], life: number): number {
    const index = clamp(life) * (curve.length - 1);
    const a = Math.floor(index);

    return curve[a] + (curve[Math.min(a + 1, curve.length - 1)] - curve[a]) * (index % 1);
}

function alphaSample(keys: number[][], life: number): number {
    const end = keys.findIndex(key => key[0] >= life);
    if (end <= 0)
        return keys[end < 0 ? keys.length - 1 : 0][1];

    const a = keys[end - 1], b = keys[end];

    return a[1] + (b[1] - a[1]) * (life - a[0]) / (b[0] - a[0]);
}

function createWaterDistortion(main: HTMLImageElement, noise: HTMLImageElement, config: NonNullable<IjenUi["nodes"][number]["distortion"]>) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = Math.max(1, Math.round(main.naturalHeight / main.naturalWidth * canvas.width));

    const context = canvas.getContext("2d")!;
    context.drawImage(main, 0, 0, canvas.width, canvas.height);

    let pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

    const noiseCanvas = document.createElement("canvas");
    noiseCanvas.width = noise.naturalWidth;
    noiseCanvas.height = noise.naturalHeight;

    const noiseContext = noiseCanvas.getContext("2d")!;
    noiseContext.drawImage(noise, 0, 0);

    let noisePixels = noiseContext.getImageData(0, 0, noiseCanvas.width, noiseCanvas.height).data;
    const noiseWidth = noiseCanvas.width, noiseHeight = noiseCanvas.height;
    noiseCanvas.width = noiseCanvas.height = 0;

    let output = context.createImageData(canvas.width, canvas.height);
    let previousTick = -1;

    return {
        render(seconds: number) {
            const tick = Math.floor(seconds * 24);
            if (tick === previousTick)
                return canvas;

            previousTick = tick;
            const width = canvas.width, height = canvas.height;
            const time = tick / 24;

            for (let y = 0; y < height; y++)
            {
                const v = 1 - (y + 0.5) / height;
                const nv = v * config.scale[1] + config.offset[1] + time * config.scroll[1];
                const ny = (Math.floor((1 - (nv - Math.floor(nv))) * noiseHeight) + noiseHeight) % noiseHeight;

                for (let x = 0; x < width; x++)
                {
                    const u = (x + 0.5) / width;
                    const nu = u * config.scale[0] + config.offset[0] + time * config.scroll[0];
                    const nx = Math.floor((nu - Math.floor(nu)) * noiseWidth);
                    const n = (ny * noiseWidth + nx) * 4;
                    const sx = Math.max(0, Math.min(width - 1, Math.round(x + noisePixels[n] / 255 * config.amount * config.scroll[2] * width)));
                    const sy = Math.max(0, Math.min(height - 1, Math.round(y - noisePixels[n + 1] / 255 * config.amount * config.scroll[3] * height)));
                    const source = (sy * width + sx) * 4, dest = (y * width + x) * 4;

                    for (let channel = 0; channel < 4; channel++)
                        output.data[dest + channel] = pixels[source + channel];

                    output.data[dest + 3] = output.data[dest + 3] * output.data[dest + 3] / 255;
                }
            }

            context.putImageData(output, 0, 0);
            return canvas;
        },
        destroy() {
            canvas.width = canvas.height = 0;
            pixels = noisePixels = new Uint8ClampedArray();
            output = new ImageData(1, 1);
        }
    };
}
