export type MachairodusTargetPhase = "enter" | "active" | "exit";

export interface MachairodusTargetView {
    id: number;
    x: number;
    y: number;
    gold: boolean;
    upper: boolean;
    tilt: number;
    exitAge: number | null;
}

export const targetWidth = 258.048;
export const targetHeight = 288.768;

const entryKeys = [
    [0, 30000, -9000, 0, 100],
    [0.2, -5505.69140625, 1789.349365234, 0, -20],
    [0.416666657, 1023.999633789, -383.999908447, 0, 8]
] as const;

const exitAngles = [
    0, 0.143894, 0.471817, 1.063362, 2.033647, 3.548714,
    5.841795, 9.216406, 14.00139, 20.420351, 28.426727,
    37.680779, 47.723598, 58.161411, 68.729645, 79.273514,
    89.710426, 100
] as const;

export function targetTilt(phase: MachairodusTargetPhase, age: number): number {
    if (phase === "active")
        return 0;

    const time = Math.max(0, age);

    if (phase === "enter")
    {
        if (time >= 2 / 3)
            return 0;

        const key = time < 0.2 ? entryKeys[0] : time < 5 / 12 ? entryKeys[1] : entryKeys[2];
        const offset = time - key[0];

        return ((key[1] * offset + key[2]) * offset + key[3]) * offset + key[4];
    }

    const position = Math.min(exitAngles.length - 1, time * 60);
    const index = Math.floor(position);
    const next = Math.min(index + 1, exitAngles.length - 1);

    return exitAngles[index] + (exitAngles[next] - exitAngles[index]) * (position - index);
}
