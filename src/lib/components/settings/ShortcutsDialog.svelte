<script lang="ts">
    import Icon from '@iconify/svelte';
    import Dialog from '$lib/components/shared/Dialog.svelte';
    import { t } from '$lib/i18n';
    import { IS_APPLE } from '@lexical/utils';

    interface Props {
        open: boolean;
        onClose: () => void;
    }

    let { open, onClose }: Props = $props();

    // Platform-aware modifier glyphs. On macOS we use the familiar symbols;
    // elsewhere we spell them out.
    const MOD = IS_APPLE ? '⌘' : 'Ctrl';
    const SHIFT = IS_APPLE ? '⇧' : 'Shift';
    const ALT = IS_APPLE ? '⌥' : 'Alt';
    const ENTER = IS_APPLE ? '⏎' : 'Enter';

    interface Shortcut {
        keys: string[];
        label: string;
    }
    interface Group {
        title: string;
        icon: string;
        items: Shortcut[];
    }

    // Built reactively so labels follow the active locale.
    let groups = $derived<Group[]>([
        {
            title: $t('shortcuts.group.general'),
            icon: 'solar:command-bold-duotone',
            items: [
                { keys: [MOD, ','], label: $t('shortcuts.open_settings') },
                { keys: [MOD, 'P'], label: $t('shortcuts.quick_open') },
                { keys: [MOD, SHIFT, 'F'], label: $t('shortcuts.global_search') },
                { keys: [MOD, SHIFT, 'E'], label: $t('shortcuts.file_explorer') },
                { keys: ['Esc'], label: $t('shortcuts.close') },
            ],
        },
        {
            title: $t('shortcuts.group.editor'),
            icon: 'solar:pen-new-square-bold-duotone',
            items: [
                { keys: [MOD, 'F'], label: $t('shortcuts.find') },
                { keys: [MOD, 'G'], label: $t('shortcuts.find_next') },
                { keys: [MOD, SHIFT, 'G'], label: $t('shortcuts.find_prev') },
                { keys: [MOD, '/'], label: $t('shortcuts.toggle_comment') },
                { keys: [SHIFT, ALT, 'A'], label: $t('shortcuts.toggle_block_comment') },
                { keys: [MOD, $t('shortcuts.click')], label: $t('shortcuts.go_to_def') },
            ],
        },
        {
            title: $t('shortcuts.group.julia'),
            icon: 'solar:code-bold-duotone',
            items: [
                { keys: [MOD, ENTER], label: $t('shortcuts.run_cell') },
                { keys: ['↑', '↓'], label: $t('shortcuts.repl_history') },
                { keys: [']'], label: $t('shortcuts.repl_pkg') },
                { keys: ['?'], label: $t('shortcuts.repl_help') },
            ],
        },
        {
            title: $t('shortcuts.group.files'),
            icon: 'solar:folder-with-files-bold-duotone',
            items: [
                { keys: [$t('shortcuts.double_click')], label: $t('shortcuts.open_file') },
                { keys: [$t('shortcuts.double_click')], label: $t('shortcuts.pin_tab') },
            ],
        },
    ]);
</script>

<Dialog {open} title={$t('shortcuts.title')} {onClose} maxWidth="max-w-md md:max-w-lg lg:max-w-xl">
    {#snippet children()}
        <div class="space-y-5 py-1">
            {#each groups as group}
                <section>
                    <div class="flex items-center gap-2 mb-2.5">
                        <Icon icon={group.icon} class="text-brand-gold-400" width="0.95rem" />
                        <h3 class="text-xs font-semibold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]">
                            {group.title}
                        </h3>
                    </div>
                    <div class="space-y-1">
                        {#each group.items as item}
                            <div class="flex items-center justify-between gap-4 rounded-lg px-2 py-1.5 hover:bg-brand-sand-50 dark:hover:bg-[#292c3c] transition-colors">
                                <span class="text-xs text-brand-charcoal-600 dark:text-[#c6d0f5]">{item.label}</span>
                                <span class="flex items-center gap-1 shrink-0">
                                    {#each item.keys as key, i}
                                        {#if i > 0}
                                            <span class="text-[0.625rem] text-brand-charcoal-300 dark:text-[#626880]">+</span>
                                        {/if}
                                        <kbd
                                            class="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded-md border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#292c3c] text-[0.6875rem] font-mono font-semibold text-brand-charcoal-700 dark:text-[#c6d0f5] shadow-sm"
                                        >{key}</kbd>
                                    {/each}
                                </span>
                            </div>
                        {/each}
                    </div>
                </section>
            {/each}
        </div>
    {/snippet}
</Dialog>
