import { acceptHMRUpdate, defineStore } from "pinia";
import { ref, watch } from "vue";

export type EntranceAnimationMode = "always" | "daily" | "never";

const preferenceKey = "daicoreviewer:entrance-mode";
const entranceKeyPrefix = "daicoreviewer:entrance-day:";
const audioVolumeKey = "daicoreviewer:audio-volume";
const audioCaptionsKey = "daicoreviewer:audio-captions";
const interactionMarkersKey = "daicoreviewer:interaction-markers";

function isMode(value: unknown): value is EntranceAnimationMode {
    return value === "always" || value === "daily" || value === "never";
}

export const useSettingsStore = defineStore("settings", () => {
    const memory = new Map<string, string>();
    const storedMode = readStored(preferenceKey);
    const storedVolume = readStored(audioVolumeKey);
    const parsedVolume = storedVolume === null ? 1 : Number(storedVolume);
    const initialVolume = Number.isFinite(parsedVolume) ? Math.max(0, Math.min(1, parsedVolume)) : 1;

    const entranceAnimation = ref<EntranceAnimationMode>(isMode(storedMode) ? storedMode : "daily");
    const audioVolume = ref(initialVolume);
    const audioCaptions = ref(readStored(audioCaptionsKey) !== "false");
    const interactionMarkers = ref(readStored(interactionMarkersKey) === "true");

    watch([audioVolume, audioCaptions], ([volume, captions]) => {
        writeStored(audioVolumeKey, String(volume));
        writeStored(audioCaptionsKey, String(captions));
    }, { immediate: true, flush: "sync" });

    watch(entranceAnimation, (value) => writeStored(preferenceKey, value), {
        immediate: true,
        flush: "sync"
    });

    watch(interactionMarkers, (value) => writeStored(interactionMarkersKey, String(value)), {
        immediate: true,
        flush: "sync"
    });

    function readStored(key: string): string | null {
        try
        {
            return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
        }
        catch
        {
            return memory.get(key) ?? null;
        }
    }

    function writeStored(key: string, value: string) {
        memory.set(key, value);

        try
        {
            window.localStorage.setItem(key, value);
        }
        catch {}
    }

    function setEntranceAnimation(value: EntranceAnimationMode) {
        if (isMode(value))
            entranceAnimation.value = value;
    }

    function claimEntranceAnimation(assetKey: string, now = new Date()): boolean {
        if (entranceAnimation.value === "never")
            return false;

        const day = [now.getFullYear(), now.getMonth() + 1, now.getDate()].join("-");
        const key = entranceKeyPrefix + assetKey;

        if (entranceAnimation.value === "daily" && readStored(key) === day)
            return false;

        writeStored(key, day);
        return true;
    }

    return {
        entranceAnimation,
        audioVolume,
        audioCaptions,
        interactionMarkers,
        setEntranceAnimation,
        claimEntranceAnimation
    };
});

if (import.meta.hot)
    import.meta.hot.accept(acceptHMRUpdate(useSettingsStore, import.meta.hot));
