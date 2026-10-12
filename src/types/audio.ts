export interface AudioCueRef {
    bank: string;
    cue: string;
}

export interface AudioCue {
    state: "ready" | "silent" | "unavailable" | "unsupported";
    url?: string;
    profile?: "voice" | "effect" | "music" | "asmr";
    bytes?: number;
    sha256?: string;
    durationSeconds?: number;
}

export interface AudioSound {
    cue_sheet: string;
    cue_name: string;
    script2?: string;
    script2_display?: number;
}

export interface AudioManifest {
    schemaVersion: number;
    mode: string;
    catalogSha256: string;
    assets: Record<string, {
        cues: AudioCueRef[];
        extra?: {
            buttons: Array<{ button: string; bank: string; cue: string }>;
        };
    }>;
    cues: Record<string, Record<string, AudioCue>>;
    sounds: Record<string, AudioSound>;
}
