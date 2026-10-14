<script setup lang="ts">
const repositoryUrl = "https://github.com/Jelosus2/DaiCoreViewer";
</script>

<template>
    <footer class="shrink-0 border-t border-line bg-sidebar px-3 py-1.5 text-xs leading-4 text-subtle lg:px-5">
        <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <p class="max-w-5xl">
                Unofficial fan project. Not affiliated with or endorsed by MEGAGAME, GameBeans or GameTree.
                Game art, audio and trademarks belong to their respective owners.
            </p>
            <nav aria-label="Project links" class="flex shrink-0 items-center gap-3">
                <a
                    :href="repositoryUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex min-h-11 items-center rounded px-1 text-muted hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-focus lg:min-h-7"
                >GitHub</a>
                <a
                    :href="`${repositoryUrl}/issues`"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex min-h-11 items-center rounded px-1 text-muted hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-focus lg:min-h-7"
                >Report a bug</a>
            </nav>
        </div>
    </footer>
</template>
