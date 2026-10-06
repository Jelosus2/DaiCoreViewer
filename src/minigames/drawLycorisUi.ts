import type { LycorisAssets, LycorisParticle, LycorisTransform, LycorisUi } from "./lycorisAssets";
import type { LycorisView } from "./createLycorisMinigame";

type Matrix = [number, number, number, number, number, number];

interface Pose extends LycorisTransform { matrix: Matrix; alpha: number }

interface Particle {
    birth: number;
    life: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    sizeY: number;
    rotation: number;
    rotationRate: number;
    color: number[];
    gradient: number;
}


const clamp = (value: number) => Math.max(0, Math.min(1, value));
const random = (range: number[]) => range[0] + Math.random() * (range[1] - range[0]);

export function layoutLycorisUi(ui: LycorisUi, view: LycorisView, width: number, height: number): Pose[] {
    const poses: LycorisTransform[] = ui.nodes.map(node => ({ ...node, scale: [...node.scale] }));

    function apply(name: string, time: number) {
        for (const clip of ui.animations.filter(clip => clip.name === name))
        {
            const t = clip.loop ? time % clip.duration : Math.min(time, clip.duration);

            for (const track of clip.tracks)
            {
                const values = sample(track.frames, t, ui.fps), pose = poses[track.node];
                const property = track.property;

                if (property === "scale")
                    pose.scale = values;
                else if (property === "active")
                    pose.active = values[0] >= 0.5;
                else if (property === "x" || property === "y" || property === "width" || property === "height" || property === "imageAlpha" || property === "groupAlpha")
                    pose[property] = values[0];
            }
        }
    }

    apply("Interface_in", view.clip === "Interface_in" ? view.clipAge : Infinity);

    if (view.clip !== "Interface_in")
        apply(view.clip, view.clipAge);

    for (const name of ["combo", "miss", "P_PickSuccess1", "P_PickSuccess2", "P_LineWave1", "P_LineWave2", "P_Flapping1", "P_Flapping2", "P_Hit"])
    {
        const start = view.effects[name];
        poses[ui.bindings[name]].active = start !== undefined;

        if (start !== undefined)
        {
            const time = view.age - start;

            if (name === "combo")
                apply("Combo", time);

            if (name === "miss")
                apply("Miss", time);
        }
    }

    poses[ui.bindings.node].active = view.ready;
    poses[ui.bindings.topMask].active = !view.ready || view.feverRemaining !== null;

    for (const name of ["imgNum2", "imgNum3"])
        poses[ui.bindings[name]].active = false;

    const digit = poses[ui.bindings.imgNum1];
    poses[ui.nodes[ui.bindings.imgNum1].parent].width = digit.width;

    const distance = view.fever === 0 ? 187 : view.fever === 1 ? 140 : 91;
    const y = view.fever === 0 ? 187 : view.fever === 1 ? 100 : -122;

    poses[ui.bindings.P_Flapping1].x = -distance;
    poses[ui.bindings.P_Flapping2].x = distance;
    poses[ui.bindings.P_Flapping1].y = poses[ui.bindings.P_Flapping2].y = y;

    const result: Pose[] = [];

    for (let index = 0; index < ui.nodes.length; index++)
    {
        const node = ui.nodes[index], pose = poses[index], parent = result[node.parent];

        if (!parent)
        {
            result.push({
                ...pose,
                width: index === 0 ? width : pose.width,
                height: index === 0 ? height : pose.height,
                matrix: [1, 0, 0, 1, 0, 0],
                alpha: pose.groupAlpha
            });

            continue;
        }

        const pivot = ui.nodes[node.parent].pivot;
        const x = pose.x + parent.width * ((node.anchorMin[0] + node.anchorMax[0]) / 2 - pivot[0]);
        const y = -pose.y - parent.height * ((node.anchorMin[1] + node.anchorMax[1]) / 2 - pivot[1]);
        const r = node.rotation;

        result.push({
            ...pose,
            width: pose.width + parent.width * (node.anchorMax[0] - node.anchorMin[0]),
            height: pose.height + parent.height * (node.anchorMax[1] - node.anchorMin[1]),
            active: pose.active && parent.active,
            alpha: pose.groupAlpha * parent.alpha,
            matrix: multiply(parent.matrix, [r[0]*pose.scale[0], r[1]*pose.scale[0], r[2]*pose.scale[1], r[3]*pose.scale[1], x, y])
        });
    }

    return result;
}


export function createLycorisUiPainter(canvas: HTMLCanvasElement, assets: LycorisAssets) {
    const context = canvas.getContext("2d");
    if (!context)
        throw new Error("Lycoris UI requires Canvas 2D");
    const { ui, images } = assets;
    const children = ui.nodes.map(() => [] as number[]);

    ui.nodes.forEach((node, i) => {
        if (node.parent >= 0)
            children[node.parent].push(i);
    });

    const textures = new Map<string, HTMLCanvasElement>();
    const sourcePixels = new Map<string, ImageData>();
    const meshTexture = document.createElement("canvas");
    meshTexture.width = 256;
    meshTexture.height = 128;

    const meshContext = meshTexture.getContext("2d")!;
    const meshPixels = meshContext.createImageData(meshTexture.width, meshTexture.height);
    const pools = new Map<number, { stamp: number; age: number; particles: Particle[] }>();
    let previousAge = -1;

    function texture(name: string, color: number[], mode: "none" | "alpha" | "additive" = "none"): CanvasImageSource {
        if (mode === "none" && color.slice(0, 3).every(value => value === 1))
            return images.get(name)!;

        const rgb = color.slice(0, 3).map(value => Math.round(clamp(value) * 255));
        const key = `${name}:${rgb.join(',')}:${mode}`;
        const existing = textures.get(key);

        if (existing)
            return existing;

        const source = images.get(name)!, target = document.createElement("canvas");
        target.width = source.naturalWidth; target.height = source.naturalHeight;

        const ctx = target.getContext("2d")!;
        ctx.drawImage(source, 0, 0);

        const data = ctx.getImageData(0, 0, target.width, target.height);

        for (let index = 0; index < data.data.length; index += 4)
        {
            for (let c = 0; c < 3; c++)
                data.data[index+c] *= rgb[c] / 255;

            if (mode === "alpha")
                data.data[index+3] *= data.data[index+3] / 255;

            if (mode === "additive")
            {
                const light = Math.max(data.data[index],data.data[index+1],data.data[index+2])/255;
                data.data[index+3] *= light;

                if (light > 0)
                {
                    for (let c = 0; c < 3; c++)
                        data.data[index+c] /= light;
                }
            }
        }

        ctx.putImageData(data, 0, 0);

        if (textures.size >= 64)
        {
            const oldest = textures.keys().next().value!;
            const image = textures.get(oldest)!;

            image.width = image.height = 0;
            textures.delete(oldest);
        }

        textures.set(key, target);
        return target;
    }

    function emit(config: LycorisParticle, birth: number): Particle {
        const shape = config.shape, angle = Math.random()*Math.PI*2;
        const radius = shape.enabled ? Math.sqrt(Math.random())*shape.radius : 0;
        const box = shape.type === 5;
        const x = shape.enabled ? (box ? Math.random()-0.5 : Math.cos(angle)*radius)*shape.scale[0] : 0;
        const y = shape.enabled ? (box ? Math.random()-0.5 : Math.sin(angle)*radius)*shape.scale[1] : 0;
        const size = random(config.size), speed = random(config.startSpeed), gradient = Math.random();

        return {
            birth,
            life: random(config.lifetime),
            x: x+shape.position[0],
            y: y+shape.position[1],
            vx: random(config.velocity[0])+Math.cos(angle)*speed,
            vy: random(config.velocity[1])+Math.sin(angle)*speed,
            size,
            sizeY: config.sizeY ? random(config.sizeY) : size,
            rotation: random(config.rotation),
            rotationRate: random(config.rotationRate),
            gradient,
            color: config.startColor[0].map((value, i) => value+(config.startColor[1][i]-value)*gradient)
        };
    }

    function pixels(name: string) {
        const cached = sourcePixels.get(name);
        if (cached)
            return cached;

        const image = images.get(name)!;
        const buffer = document.createElement("canvas");
        buffer.width = image.naturalWidth;
        buffer.height = image.naturalHeight;

        const ctx = buffer.getContext("2d")!;
        ctx.drawImage(image, 0, 0);

        const data = ctx.getImageData(0, 0, buffer.width, buffer.height);
        sourcePixels.set(name, data);

        buffer.width = buffer.height = 0;
        return data;
    }

    function maskedTexture(config: LycorisParticle, color: number[], age: number) {
        const source = pixels(config.texture), mask = config.mask!, maskPixels = pixels(mask.texture);

        const wrap = (value: number) => value - Math.floor(value);

        function offset(image: ImageData, u: number, v: number) {
            return 4 * (Math.floor(wrap(u) * image.width) + Math.floor(wrap(1 - v) * image.height) * image.width);
        }

        for (let y = 0; y < meshTexture.height; y++)
        {
            const v = 1 - (y + 0.5) / meshTexture.height;

            for (let x = 0; x < meshTexture.width; x++)
            {
                const u = (x + 0.5) / meshTexture.width;
                const a = offset(source, u * config.textureScale[0] + config.textureOffset[0] + age * config.scroll[0],
                    v * config.textureScale[1] + config.textureOffset[1] + age * config.scroll[1]);

                const b = offset(maskPixels, u * mask.scale[0] + mask.offset[0] + age * mask.scroll[0],
                    v * mask.scale[1] + mask.offset[1] + age * mask.scroll[1]);

                const dest = 4 * (x + y * meshTexture.width);

                const mainAlpha = source.data[a + 3] / 255;
                const maskAlpha = maskPixels.data[b] / 255 * maskPixels.data[b + 3] / 255;
                const glow = config.glowScale ?? 1, alphaScale = config.alphaScale ?? 1;
                const transparency = clamp(config.transparency ?? 1);
                let alpha: number;

                if (config.blend === "source-over")
                    alpha = clamp(clamp(color[3] * mainAlpha) * alphaScale * mainAlpha * maskAlpha) * transparency;
                else
                    alpha = clamp(color[3] * mainAlpha * glow * maskAlpha) * transparency;

                const rgb = [] as number[];

                for (let c = 0; c < 3; c++)
                {
                    const value = source.data[a + c] / 255 * Math.max(0, color[c]) * glow * maskPixels.data[b + c] / 255;

                    rgb.push(config.blend === "lighter" ? clamp(value * transparency * alpha) : clamp(value));
                }

                const coverage = config.blend === "lighter" ? Math.max(...rgb) : alpha;

                for (let c = 0; c < 3; c++)
                    meshPixels.data[dest + c] = (config.blend === "lighter" && coverage > 0 ? rgb[c] / coverage : rgb[c]) * 255;

                meshPixels.data[dest + 3] = coverage * 255;
            }
        }

        meshContext.putImageData(meshPixels, 0, 0);
        return meshTexture;
    }

    function meshParticle(source: CanvasImageSource, config: LycorisParticle, size: number, sizeY: number, age: number) {
        const mesh = config.mesh!;
        const image = source as HTMLImageElement | HTMLCanvasElement;
        const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
        const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
        const pattern = context!.createPattern(image, "repeat");

        if (!pattern)
            return;

        pattern.setTransform(new DOMMatrix([1 / width, 0, 0, -1 / height, 0, 1]));

        for (let index = 0; index < mesh.indices.length; index += 3)
        {
            const indices = mesh.indices.slice(index, index + 3);
            const points = indices.map(index => [mesh.vertices[index][0] * size, -mesh.vertices[index][1] * sizeY]);
            const uv = indices.map(index => mesh.uv[index].map((value, axis) => config.mask
                ? value
                : value * config.textureScale[axis] + config.textureOffset[axis] + age * config.scroll[axis]));

            const [u, v] = uv[0], du1 = uv[1][0] - u, dv1 = uv[1][1] - v;
            const du2 = uv[2][0] - u, dv2 = uv[2][1] - v;
            const determinant = du1 * dv2 - du2 * dv1;

            if (Math.abs(determinant) < 1e-10)
                continue;

            const [x, y] = points[0], dx1 = points[1][0] - x, dy1 = points[1][1] - y;
            const dx2 = points[2][0] - x, dy2 = points[2][1] - y;
            const a = (dx1 * dv2 - dx2 * dv1) / determinant;
            const b = (dy1 * dv2 - dy2 * dv1) / determinant;
            const c = (dx2 * du1 - dx1 * du2) / determinant;
            const d = (dy2 * du1 - dy1 * du2) / determinant;

            context!.save();
            context!.beginPath();
            points.forEach(([px, py], index) => index === 0 ? context!.moveTo(px, py) : context!.lineTo(px, py));
            context!.closePath();
            context!.clip();
            context!.transform(a, b, c, d, x - a * u - c * v, y - b * u - d * v);
            context!.fillStyle = pattern;

            const us = uv.map(point => point[0]), vs = uv.map(point => point[1]);
            const minU = Math.min(...us), minV = Math.min(...vs);

            context!.fillRect(minU, minV, Math.max(...us) - minU, Math.max(...vs) - minV);
            context!.restore();
        }
    }

    function updateParticles(index: number, stamp: number, view: LycorisView) {
        const config = ui.nodes[index].particle!;
        let pool = pools.get(index);

        if (!pool || pool.stamp !== stamp)
        {
            pool = { stamp, age: -1e-9, particles: [] };
            pools.set(index, pool);
        }

        const age = Math.max(-1e-9, (view.age-stamp)*config.speed-config.delay);

        if (age < 0)
            return pool;

        const maxLife = config.lifetime[1];
        const from = Math.max(pool.age, age-maxLife);

        const add = (time: number, count: number) => {
            if (time <= from || time > age)
                return;

            for (let n = 0; n < count && pool!.particles.length < config.capacity; n++)
                pool!.particles.push(emit(config, time));
        };

        pool.particles = pool.particles.filter(particle => age-particle.birth < particle.life);
        const firstCycle = config.loop ? Math.max(0, Math.floor(from/config.duration)) : 0;
        const lastCycle = config.loop ? Math.floor(age/config.duration) : 0;

        for (let cycle = firstCycle; cycle <= lastCycle; cycle++)
        {
            const offset = cycle*config.duration;

            for (const burst of config.bursts)
            {
                for (let n = 0; n < Math.max(1, burst.cycles); n++)
                {
                    add(offset+burst.time+n*burst.interval, burst.count);
                }
            }

            if (config.rate > 0)
            {
                const start = Math.max(1, Math.floor((from-offset)*config.rate)+1);
                const end = Math.floor(Math.min(config.duration, age-offset)*config.rate);

                for (let n = start; n <= end; n++)
                    add(offset+n/config.rate, 1);
            }
        }

        pool.age = age;
        pool.particles = pool.particles.filter(particle => age-particle.birth < particle.life);

        return pool;
    }

    return {
        draw(view: LycorisView) {
            const width = canvas.clientWidth, height = canvas.clientHeight, ratio = Math.min(2, window.devicePixelRatio || 1);
            const pw = Math.max(1, Math.round(width*ratio)), ph = Math.max(1, Math.round(height*ratio));

            if (canvas.width !== pw || canvas.height !== ph)
            {
                canvas.width = pw;
                canvas.height = ph;
            }

            context.setTransform(1,0,0,1,0,0);
            context.clearRect(0,0,pw,ph);

            if (!view.visible || width <= 0 || height <= 0)
            {
                pools.clear();
                previousAge = -1;
                return;
            }

            if (view.age < previousAge)
                pools.clear();

            previousAge = view.age;
            const scale = Math.min(width/1920,height/1080);
            const base: Matrix = [scale*ratio,0,0,scale*ratio,pw/2,ph/2];
            const poses = layoutLycorisUi(ui,view,width/scale,height/scale);

            function draw(index: number, basis: Matrix, noteIcon?: number, effectStamp?: number) {
                const node = ui.nodes[index], pose = poses[index];

                if (!pose.active)
                {
                    pools.delete(index);
                    return;
                }

                const leaf = node.path.split("/").at(-1)!;
                if (view.effects[leaf] !== undefined)
                    effectStamp = view.effects[leaf];

                if (leaf === "Vignetting" || leaf === "P_Fever_1" || leaf === "P_Fever_2")
                    effectStamp = view.age-view.clipAge;

                const matrix = multiply(basis,pose.matrix);

                context!.save();
                context!.setTransform(...matrix);

                const x = -pose.width*node.pivot[0], y = -pose.height*(1-node.pivot[1]);

                if (node.image)
                {
                    let name = node.image.sprite;

                    if (index === ui.bindings.imgNum1)
                        name = `img_08_0${view.combo}`;

                    if (noteIcon && name?.startsWith("img_02_"))
                        name = `img_02_0${noteIcon}`;

                    const color = node.image.color, material = node.image.material;
                    context!.globalAlpha = clamp(pose.alpha*pose.imageAlpha*color[3]*(material?.tint[3] ?? 1));
                    context!.globalCompositeOperation = material?.blend ?? "source-over";

                    if (index === ui.bindings.imgFever)
                    {
                        context!.beginPath(); context!.rect(x,y+pose.height*(1-clamp(view.fill)),pose.width,pose.height*clamp(view.fill)); context!.clip();
                    }

                    if (name)
                    {
                        const image = texture(name,color,material ? (material.blend === "lighter" ? "additive" : "alpha") : "none");

                        if (material && (material.textureScale[0] !== 1 || material.scroll[0] !== 0))
                        {
                            context!.beginPath();
                            context!.rect(x,y,pose.width,pose.height);
                            context!.clip();

                            const tileWidth = pose.width/material.textureScale[0];
                            const offset = ((view.age*material.scroll[0]+material.textureOffset[0])%1)*tileWidth;

                            for (let tx = x-offset-tileWidth; tx < x+pose.width; tx += tileWidth)
                                context!.drawImage(image,tx,y,tileWidth,pose.height);
                        }
                        else if (node.image.type === 1)
                        {
                            nineSlice(context!,image,images.get(name)!,node.image.border,x,y,pose.width,pose.height);
                        }
                        else
                        {
                            context!.drawImage(image,x,y,pose.width,pose.height);
                        }
                    }
                }

                if (node.particle)
                {
                    const config = node.particle;
                    const pool = updateParticles(index,effectStamp ?? view.age-view.clipAge,view);

                    for (const particle of pool.particles)
                    {
                        const age = pool.age-particle.birth, life = age/particle.life;
                        const start = Math.min(config.colorCurve.length-1,Math.floor(clamp(life)*(config.colorCurve.length-1)));
                        const gradient = config.colorCurve[start];
                        const color = particle.color.map((value,i) => value*(gradient[0][i]+(gradient[1][i]-gradient[0][i])*particle.gradient)*config.tint[i]);
                        const size = particle.size*curve(config.sizeCurve,life);
                        const sizeY = particle.sizeY*curve(config.sizeY ? config.sizeYCurve : config.sizeCurve,life);

                        context!.save();
                        context!.translate(particle.x+age*particle.vx,-particle.y-age*particle.vy);
                        context!.rotate(-particle.rotation-age*particle.rotationRate);
                        context!.globalAlpha = clamp(pose.alpha*color[3]);
                        context!.globalCompositeOperation = config.blend;


                        const tint = color.map(value => Math.round(clamp(value)*15)/15);
                        const source = texture(config.texture, tint, config.blend === "source-over" ? "alpha" : "additive");

                        if (config.mesh)
                        {
                            if (config.mask)
                                context!.globalAlpha = clamp(pose.alpha);

                            meshParticle(config.mask ? maskedTexture(config, color, age) : source, config, size, sizeY, age);
                        }
                        else
                            context!.drawImage(source, -size / 2, -sizeY / 2, size, sizeY);

                        context!.restore();
                    }
                }

                context!.restore();

                if (index === ui.bindings.pointL || index === ui.bindings.pointR)
                {
                    const lane = index === ui.bindings.pointL ? "left" : "right";

                    for (const note of view.notes.filter(note => note.lane === lane))
                    {
                        const s = note.age === 0 ? 0.2 : 1.15*Math.min(1,note.age/2);
                        const noteBase = multiply(matrix,[s,0,0,s,0,1850*Math.min(1,note.age/2)]);

                        draw(ui.bindings.note,noteBase,note.icon);
                    }
                }

                for (const child of children[index])
                    draw(child,basis,noteIcon,effectStamp);
            }

            draw(0,base);
        },
        destroy() {
            pools.clear();

            for (const image of textures.values())
                image.width = image.height = 0;

            textures.clear();
            sourcePixels.clear();

            meshTexture.width = meshTexture.height = 0;
            canvas.width = canvas.height = 0;
        }
    };
}

function multiply(a: Matrix, b: Matrix): Matrix {
    return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
            a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}

function sample(frames: number[][], time: number, fps: number): number[] {
    const index = Math.max(0, Math.min(frames.length - 1, time * fps));
    const a = frames[Math.floor(index)], b = frames[Math.min(frames.length - 1, Math.floor(index) + 1)];

    return a.map((value, i) => value + (b[i] - value) * (index % 1));
}

function curve(frames: number[], time: number): number {
    const index = clamp(time) * (frames.length - 1), start = Math.floor(index);
    return frames[start] + (frames[Math.min(frames.length - 1, start + 1)] - frames[start]) * (index % 1);
}

function nineSlice(ctx: CanvasRenderingContext2D, image: CanvasImageSource, original: HTMLImageElement, border: number[], x: number, y: number, width: number, height: number) {
    const [left,bottom,right,top] = border;
    const sx = [0,left,original.naturalWidth-right,original.naturalWidth];
    const sy = [0,top,original.naturalHeight-bottom,original.naturalHeight];
    const kx = Math.min(1,width/Math.max(1,left+right)), ky = Math.min(1,height/Math.max(1,top+bottom));
    const dx = [x,x+left*kx,x+width-right*kx,x+width], dy = [y,y+top*ky,y+height-bottom*ky,y+height];

    for (let row = 0; row < 3; row++)
    {
        for (let col = 0; col < 3; col++)
        {
            if (sx[col+1] > sx[col] && sy[row+1] > sy[row])
                ctx.drawImage(image,sx[col],sy[row],sx[col+1]-sx[col],sy[row+1]-sy[row],dx[col],dy[row],dx[col+1]-dx[col],dy[row+1]-dy[row]);
        }
    }
}
