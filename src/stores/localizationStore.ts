import type { GameLanguage, RuntimeLocalization } from "@/types/localization";
import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import { useSettingsStore } from "./settingsStore";

export const useLocalizationStore = defineStore("localization", () => {
    const settings = useSettingsStore();
    const data = shallowRef<RuntimeLocalization>();
    const error = ref("");

    async function load(catalogSha256: string, signal?: AbortSignal) {
        data.value = undefined;
        error.value = "";

        try
        {
            const response = await fetch(`${import.meta.env.BASE_URL}data/localization.json`, { signal });
            if (!response.ok)
                throw new Error(`Localization request failed: ${response.status}`);

            const value = await response.json() as RuntimeLocalization;

            if (
                value.schemaVersion !== 1 || value.sourceLocale !== "zh-Hant" || value.locale !== "en" ||
                value.catalogSha256 !== catalogSha256 || !/^[a-f0-9]{64}$/.test(value.audioSha256) ||
                !value.entries || typeof value.entries !== "object" || Array.isArray(value.entries) ||
                Object.values(value.entries).some((entry) => !Array.isArray(entry) || entry.length !== 2 ||
                entry.some((text) => typeof text !== "string" || !text.trim())) ||
                !Array.isArray(value.nonsexualAdaptations) || value.nonsexualAdaptations.some((key) => typeof key !== "string" || !value.entries[key])
            )
            {
                throw new Error("Localization does not match this game catalog");
            }

            if (!signal?.aborted)
                data.value = value;
        }
        catch (cause)
        {
            if (!signal?.aborted)
            {
                error.value = "English translations could not be loaded. Original Chinese is shown. Reload the page to try again.";
                console.warn("Localization unavailable:", cause);
            }
        }
    }

    function text(key: string, original: string, language: GameLanguage = settings.gameLanguage): string {
        const entry = data.value?.entries[key];
        return language === "en" && entry?.[0] === original ? entry[1] : original;
    }

    function caption(key: string, original: string, audioSha256: string): string {
        return data.value?.audioSha256 === audioSha256 ? text(key, original) : original;
    }

    return {
        data,
        error,
        load,
        text,
        caption
    };
});
