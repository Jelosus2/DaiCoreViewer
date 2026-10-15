import type { AsmrState } from "@/types/audio";

interface AsmrPlaybackOptions {
    blob: Blob;
    context: AudioContext;
    gain: GainNode;
    duration: number;
    words: Array<{ index: number; time: number; word: string }>;
    translateCaption: (index: number, original: string) => string;
    captions: () => boolean;
    onCaption: (text: string) => void;
    onBlocked: (blocked: boolean) => void;
    onState: (state: AsmrState) => void;
    onFrame: (time: number, duration: number, delta: number) => void;
    onError: (error: unknown) => void;
}

export function createAsmrPlayback(options: AsmrPlaybackOptions) {
    const url = URL.createObjectURL(options.blob);
    const element = new Audio(url);
    const source = options.context.createMediaElementSource(element);

    source.connect(options.gain);
    element.loop = false;

    const words = [...options.words].sort((a, b) => a.time - b.time);
    let wanted = true;
    let pending = false;
    let destroyed = false;
    let failed = false;
    let waiting = true;
    let previousTime = 0;
    let lastCaption = "";
    let lastState = "";
    let request = 0;

    function duration() {
        return Number.isFinite(element.duration) && element.duration > 0 ? element.duration : options.duration;
    }

    function update() {
        if (destroyed)
            return;

        if (options.context.state !== "running" && !element.paused)
            element.pause();

        const time = Math.max(0, Math.min(duration(), element.currentTime));
        const paused = !wanted || element.ended || failed;
        const blocked = wanted && !failed && !element.ended && (element.paused || options.context.state !== "running");
        const advancing = !paused && !blocked && !waiting && !element.seeking;
        const delta = advancing ? Math.max(0, time - previousTime) : 0;
        let text = "";
        previousTime = time;

        options.onFrame(time, duration(), delta);

        if (options.captions() && !failed && !element.ended)
        {
            for (const word of words)
            {
                if (word.time > Math.floor(time))
                    break;

                text = options.translateCaption(word.index, word.word);
            }
        }

        if (text !== lastCaption)
        {
            lastCaption = text;
            options.onCaption(text);
        }

        const state = {
            time,
            duration: duration(),
            paused,
            ended: element.ended,
            ready: element.readyState >= 1 && !failed,
            blocked
        };
        const signature = JSON.stringify(state);

        if (signature !== lastState)
        {
            lastState = signature;
            options.onState(state);
        }

        options.onBlocked(blocked);
    }

    function fail(error: unknown) {
        if (destroyed)
            return;

        failed = true;
        wanted = false;

        element.pause();
        update();
        options.onError(error);
    }

    function resume() {
        if (destroyed || failed || pending || !wanted)
            return;

        if (options.context.state !== "running")
        {
            update();
            return;
        }

        pending = true;
        const token = request;

        void element.play().then(() => {
            if (destroyed || !wanted)
                element.pause();
        }).catch((error: unknown) => {
            if (destroyed || !wanted || token !== request)
                return;

            if (!(error instanceof DOMException) || error.name !== "NotAllowedError")
                fail(error);
        }).finally(() => {
            pending = false;
            update();

            if (!destroyed && wanted && token !== request)
                resume();
        });
    }

    function toggle() {
        if (destroyed || failed)
            return;

        if (element.ended)
        {
            element.currentTime = 0;
            previousTime = 0;
            wanted = true;
        }
        else if (wanted && (element.paused || options.context.state !== "running"))
        {
            wanted = true;
        }
        else
        {
            wanted = !wanted;
        }

        if (wanted)
        {
            resume();
        }
        else
        {
            request++;
            element.pause();
        }

        update();
    }

    function seek(time: number) {
        if (destroyed || failed || wanted && !element.ended || element.readyState < 1 || !Number.isFinite(time))
            return;

        wanted = false;
        element.currentTime = Math.max(0, Math.min(duration(), Math.round(time)));
        previousTime = element.currentTime;

        update();
    }

    element.onloadedmetadata = update;
    element.onplaying = () => {
        waiting = false;
        update();
    };

    element.onwaiting = () => {
        waiting = true;
        update();
    };

    element.onseeked = update;
    element.onended = () => {
        wanted = false;
        update();
    };

    element.onerror = () => fail(new Error(`ASMR playback failed: ${element.error?.message ?? "media error"}`));

    update();
    resume();

    return {
        update,
        resume,
        toggle,
        seek,
        destroy() {
            if (destroyed)
                return;

            destroyed = true;
            wanted = false;

            element.onloadedmetadata = element.onplaying = element.onwaiting = element.onseeked = element.onended = element.onerror = null;
            element.pause();
            element.removeAttribute("src");
            element.load();
            source.disconnect();
            URL.revokeObjectURL(url);
            options.onCaption("");
        }
    };
}
