export type GameLanguage = "zh-Hant" | "en";
export type TranslateGameText = (key: string, original: string, language?: GameLanguage) => string;

export interface RuntimeLocalization {
    schemaVersion: 1;
    sourceLocale: "zh-Hant";
    locale: "en";
    catalogSha256: string;
    audioSha256: string;
    entries: Record<string, [original: string, english: string]>;
    nonsexualAdaptations: string[];
}
