import type { ChangelogRelease } from "@/types/changelog";

export const changelog: ChangelogRelease[] = [{
    id: "2026-10-28-content-01",
    date: "2026-10-28",
    title: "October content update",
    sections: [
        {
            title: "Added",
            lines: [
                "New skin: [character]1034003[/character].",
                "New skin: [character]2024006[/character].",
                "New skin: [character]3043004[/character].",
                "New skin: [character]6035004[/character].",
                "Added censored skin: [character]2014004:censored[/character].",
                "Added a new archive to explore: [archive]122[/archive].",
                "Added a new asset to the Other category: [other]prefabs_spine_30431_skin_lepus04c_spine:0[/other].",
                "A feature to play with the layer visibility of the models."
            ]
        },
        {
            title: "Changed",
            lines: [
                "Kept [character]2014004[/character] alongside [character]2014004:censored[/character]."
            ]
        },
        {
            title: "Fixed",
            lines: [
                "Enabled the available interaction audio for [archive]122[/archive]."
            ]
        }
    ]
}];
