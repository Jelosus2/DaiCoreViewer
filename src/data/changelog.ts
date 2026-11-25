import type { ChangelogRelease } from "@/types/changelog";

export const changelog: ChangelogRelease[] = [
    {
        id: "2026-11-24-content-01",
        date: "2026-11-24",
        title: "November content update",
        sections: [
            {
                title: "Added",
                lines: [
                    "New character: [character]1033002[/character].",
                    "New skin: [character]1033101[/character].",
                    "New skin: [character]1033003[/character].",
                    "New skin: [character]1033103[/character].",
                    "New skin: [character]3050004[/character].",
                    "New skin: [character]7044004[/character].",
                    "New skin: [character]7045004[/character].",
                    "Added the censored Capriccio to the Other category: [other]prefabs_spine_20140_skin_newcapriccio04a_spine:0[/other]."
                ]
            },
            {
                title: "Changed",
                lines: [
                    "The game restored the original [character]2014004[/character], so it is now the only character entry; the censored version moved to Other.",
                    "Updated [archive]122[/archive] interaction timing and transition to match the game."
                ]
            }
        ]
    },
    {
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
                    "Added censored skin: [other]prefabs_spine_20140_skin_newcapriccio04a_spine:0[/other].",
                    "Added a new archive to explore: [archive]122[/archive].",
                    "Added a new asset to the Other category: [other]prefabs_spine_30431_skin_lepus04c_spine:0[/other].",
                    "A feature to play with the layer visibility of the models."
                ]
            },
            {
                title: "Changed",
                lines: [
                    "Kept [character]2014004[/character] alongside the censored version."
                ]
            },
            {
                title: "Fixed",
                lines: [
                    "Enabled the available interaction audio for [archive]122[/archive]."
                ]
            }
        ]
    }
];
