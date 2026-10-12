import type { MinigamePortrait, MinigameAudio } from "../types";

export type LycorisButton = "left" | "right" | "fever" | "back";

export interface LycorisNote {
    id: number;
    lane: "left" | "right";
    age: number;
    icon: number
}

export interface LycorisView {
    visible: boolean;
    age: number;
    ready: boolean;
    ending: boolean;
    changing: boolean;
    remaining: number;
    combo: number;
    fever: number;
    feverRemaining: number | null;
    fill: number;
    clip: string;
    clipAge: number;
    notes: LycorisNote[];
    effects: Record<string, number>;
}

export function createLycorisMinigame(options: Pick<MinigamePortrait, "playAction"> & { audio: MinigameAudio }) {
    const cooldowns = new Map<LycorisButton, number>();
    const voiceIds = [70400119, 70400120, 70400122];
    let running = false, ending = false, changing = false;
    let generation = 0, nextId = 0, age = 0, wait = 1.5, remaining = 30, combo = 0, fever = 0;
    let feverRemaining: number | null = null;
    let nextLeft = 0, nextRight = 0, clip = "Interface_in", clipStart = 0;
    let notes: LycorisNote[] = [];
    let effects: Record<string, number> = {};

    const interval = () => 0.4 + Math.random() * 0.6;
    const effect = (name: string) => { effects[name] = age; };
    const sound = (suffix: string) => options.audio.playEffect("temp/temp.acb", `LycorisRadiata_effects_${suffix}`);
    const voice = () => options.audio.playVoice(voiceIds[Math.floor(Math.random() * voiceIds.length)]);


    function finish(index: number) {
        ending = true;
        options.playAction(index);
    }

    function beginFever() {
        fever++;
        changing = true;

        const token = generation;

        if (!options.playAction(fever === 1 ? 9 : 10, () => {
            if (running && token === generation)
                changing = false;
        }))
        {
            changing = false;
        }

        feverRemaining = 6;
        nextLeft = nextRight = age + 8;
        clip = "interface_feverTimein";
        clipStart = age;

        sound("03");
    }

    return {
        start() {
            generation++;
            running = true;
            ending = changing = false;
            nextId = age = combo = fever = 0;
            wait = 1.5;
            remaining = 30;
            feverRemaining = null;
            notes = [];
            effects = {};
            clip = "Interface_in";
            clipStart = 0;

            cooldowns.clear();
            options.audio.playMusic("bgms/LycorisRadiata_Music_01.acb", "LycorisRadiata_Music_01");
        },
        advance(seconds: number) {
            if (!running || !Number.isFinite(seconds) || seconds < 0)
                return;

            age += seconds;
            notes = notes.map(note => ({ ...note, age: note.age + seconds })).filter(note => note.age < 2);

            if (ending)
                return;

            if (wait > 0)
            {
                wait = Math.max(0, wait - seconds);

                if (wait === 0)
                {
                    nextLeft = age + interval();
                    nextRight = age + interval();
                    clipStart = age;
                }
            }
            else if (feverRemaining !== null)
            {
                feverRemaining = Math.max(0, feverRemaining - seconds);

                if (feverRemaining === 0)
                {
                    if (fever >= 2)
                    {
                        finish(11);
                    }
                    else
                    {
                        combo = 0;
                        feverRemaining = null;
                        clip = "interface_feverTimeout";
                        clipStart = age;
                    }
                }
            }
            else
            {
                for (const lane of ["left", "right"] as const)
                {
                    if (age <= (lane === "left" ? nextLeft : nextRight))
                        continue;

                    const next = age + interval();

                    if (lane === "left")
                        nextLeft = next;
                    else
                        nextRight = next;

                    notes.push({ id: ++nextId, lane, age: 0, icon: Math.random() < 0.5 ? 1 : 2 });
                }

                remaining = Math.max(0, remaining - seconds);
                if (remaining === 0)
                    finish(12);
            }
        },
        click(button: LycorisButton, nowMs: number): boolean {
            if (!running || !Number.isFinite(nowMs) || nowMs < (cooldowns.get(button) ?? -Infinity))
                return false;

            cooldowns.set(button, nowMs + (button === "back" ? 500 : 1));
            if (ending)
                return false;

            if (button === "back")
            {
                if (wait > 0 || feverRemaining !== null)
                    return false;

                finish(12);
                return true;
            }

            if (changing || remaining <= 0.5 || wait > 0)
                return false;

            if (button === "fever")
            {
                if (feverRemaining === null || feverRemaining <= 0)
                    return false;

                const left = Math.random() < 0.5;

                effect("P_Hit");
                effect(left ? "P_Flapping1" : "P_Flapping2");

                options.playAction(fever < 2 ? (left ? 6 : 7) : 8);
                sound("02");
                voice();

                return true;
            }

            if (feverRemaining !== null)
                return false;

            const left = button === "left";

            effect(left ? "P_PickSuccess1" : "P_PickSuccess2");
            effect(left ? "P_Flapping1" : "P_Flapping2");

            options.playAction(fever === 0 ? (left ? 4 : 5) : (left ? 6 : 7));
            sound("01");

            const index = notes.findIndex(note => note.lane === button && -1850 * note.age / 2 > -1385 && -1850 * note.age / 2 < -1179);

            if (index < 0)
            {
                effect("miss");
            }
            else
            {
                notes.splice(index, 1);
                combo++;

                sound("04");
                voice();

                effect("combo");
                effect(left ? "P_LineWave1" : "P_LineWave2");

                if (combo >= 6)
                    beginFever();
            }

            return true;
        },
        snapshot(): LycorisView {
            return {
                visible: running,
                age,
                ready: wait === 0,
                ending,
                changing,
                remaining,
                combo,
                fever,
                feverRemaining,
                fill: feverRemaining === null ? combo / 6 : feverRemaining / 6,
                clip,
                clipAge: age - clipStart,
                notes: notes.map(note => ({ ...note })),
                effects: { ...effects }
            };
        },
        isRunning() {
            return running;
        },
        stop() {
            options.audio.stopMusic();

            generation++;
            running = ending = changing = false;
            notes = [];
            effects = {};

            cooldowns.clear();
        }
    };
}
