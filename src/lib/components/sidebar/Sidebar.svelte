<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import CollapsibleSidebar from '$lib/components/shared/CollapsibleSidebar.svelte';
	import RichTextEditor from '$lib/components/editor/EditorComposer.svelte';
	import TypstEditor from '$lib/components/editor/TypstEditor.svelte';
	import JuliaEditor from '$lib/components/editor/JuliaEditor.svelte';
	import EditorTabs from '$lib/components/editor/EditorTabs.svelte';
	import ActionBar from '$lib/components/lexical/components/actionbar/ActionBar.svelte';
	import FileExplorer from '$lib/components/shared/FileExplorer.svelte';
	import { lexicalEditorInstance, lexicalHistoryState, typstSource } from '$lib/stores/editor.store';
	import { tabs, activeTab, activeTabId, createTab } from '$lib/stores/tabs.store';
	import { hideSurahPage } from '$lib/stores/quran.svelte';
	import { juliaGroups } from '$lib/stores/julia-terminal.store';
	import Icon from '@iconify/svelte';
	import type { EditorTab } from '$lib/stores/tabs.store';
	import { CAN_UNDO_COMMAND, CAN_REDO_COMMAND } from 'lexical';
	import type { HistoryState } from '@lexical/history';

	// Bootstrap: ensure at least one tab exists
	onMount(() => {
		if (get(tabs).length === 0) {
			const t = createTab('lexical');
			tabs.set([t]);
			activeTabId.set(t.id);
		}
	});

	// Per-tab Lexical history snapshots (saved when leaving a lexical tab)
	type HistorySnapshot = Pick<HistoryState, 'undoStack' | 'redoStack'>;
	const lexicalTabHistories = new Map<string, HistorySnapshot>();

	// When active tab changes: sync editor state
	let prevTabId: string | null = null;
	$effect(() => {
		const tab = $activeTab;
		if (!tab || tab.id === prevTabId) return;

		// Save departing lexical tab state + history
		if (prevTabId) {
			const prevTab = get(tabs).find(t => t.id === prevTabId);
			if (prevTab?.type === 'lexical') {
				const editor = get(lexicalEditorInstance);
				if (editor) {
					const json = JSON.stringify(editor.getEditorState().toJSON());
					tabs.update(ts => ts.map(t => (t.id === prevTabId ? { ...t, content: json } : t)));
				}
				const hs = get(lexicalHistoryState);
				if (hs) {
					lexicalTabHistories.set(prevTabId, {
						undoStack: [...hs.undoStack],
						redoStack: [...hs.redoStack],
					});
				}
			}
		}
		prevTabId = tab.id;

		// Restore arriving tab state
		if (tab.type === 'typst' || tab.type === 'text') {
			typstSource.set(tab.content);
		} else if (tab.type === 'julia') {
			/* REPL history is managed via juliaReplHistory store */
		} else if (tab.type === 'lexical') {
			const editor = get(lexicalEditorInstance);
			if (editor) {
				if (tab.content) {
					try {
						const parsed = JSON.parse(tab.content);
						const stateData = parsed.editorState ?? parsed;
						editor.setEditorState(editor.parseEditorState(JSON.stringify(stateData)));
					} catch {
						/* fall through to clear on parse failure */
					}
				} else {
					const emptyState = '{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}';
					editor.setEditorState(editor.parseEditorState(emptyState));
				}

				const hs = get(lexicalHistoryState);
				if (hs) {
					const saved = lexicalTabHistories.get(tab.id);
					hs.undoStack  = saved ? [...saved.undoStack]  : [];
					hs.redoStack  = saved ? [...saved.redoStack]  : [];
					editor.dispatchCommand(CAN_UNDO_COMMAND, hs.undoStack.length > 0);
					editor.dispatchCommand(CAN_REDO_COMMAND, hs.redoStack.length > 0);
				}
			}
		}
	});

	// Whether we're in "Julia side-panel" mode: REPL moves to the right side
	let juliaMode = $derived($hideSurahPage() && $activeTab?.type === 'julia');

	// Split tab id (for badge visibility)
	let _activeGroup = $derived($juliaGroups.find(g => g.tabA === $activeTabId || g.tabB === $activeTabId));
	let splitTabId = $derived(_activeGroup
		? (_activeGroup.tabA === $activeTabId ? _activeGroup.tabB : _activeGroup.tabA)
		: null);

	function fileTypeInfo(tab: EditorTab): { icon: string; label: string; color: string } {
		const c = 'text-brand-charcoal-300';
		if (tab.type === 'julia')  return { icon: 'solar:code-bold-duotone',          label: 'Julia',     color: c };
		if (tab.type === 'typst')  return { icon: 'solar:document-text-bold-duotone', label: 'Typst',     color: c };
		if (tab.type === 'lexical')return { icon: 'solar:text-bold-duotone',           label: 'Rich Text', color: c };
		const ext = (tab.path ?? tab.name).split('.').pop()?.toLowerCase() ?? '';
		const extMap: Record<string, { icon: string; label: string }> = {
			py:  { icon: 'solar:code-bold-duotone',          label: '.py'   },
			r:   { icon: 'solar:code-bold-duotone',          label: '.r'    },
			bib: { icon: 'solar:book-bold-duotone',          label: '.bib'  },
			tex: { icon: 'solar:document-text-bold-duotone', label: '.tex'  },
			md:  { icon: 'solar:text-bold-duotone',          label: '.md'   },
			csv: { icon: 'solar:database-bold-duotone',      label: '.csv'  },
			js:  { icon: 'solar:code-bold-duotone',          label: '.js'   },
			ts:  { icon: 'solar:code-bold-duotone',          label: '.ts'   },
			json:{ icon: 'solar:file-text-bold-duotone',     label: '.json' },
			sh:  { icon: 'solar:terminal-bold-duotone',      label: '.sh'   },
			sql: { icon: 'solar:database-bold-duotone',      label: '.sql'  },
			html:{ icon: 'solar:code-bold-duotone',          label: '.html' },
			css: { icon: 'solar:pallete-bold-duotone',       label: '.css'  },
			typ: { icon: 'solar:document-text-bold-duotone', label: '.typ'  },
		};
		const e = extMap[ext] ?? { icon: 'solar:file-bold-duotone', label: ext ? `.${ext}` : 'Text' };
		return { ...e, color: c };
	}
</script>

<CollapsibleSidebar roundRight={!juliaMode}>
	<div class="relative h-full flex flex-col overflow-visible">
		<!-- File Explorer button sits outside the editor on the left (LTR) or right (RTL), panel slides into the parchment area -->
		<FileExplorer />
		<ActionBar />
		{#if $activeTab}
			{@const ft = fileTypeInfo($activeTab)}
			<div class="absolute -top-5 right-2 z-10 pointer-events-none">
				<span class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold
							 bg-brand-sand-100/80 border border-brand-sand-200 backdrop-blur-sm
							 dark:bg-[#292c3c]/80 dark:border-[#414559] {ft.color}">
					<Icon icon={ft.icon} width="0.6rem" />
					{ft.label}
				</span>
			</div>
		{/if}
		<div class="flex-1 min-h-0 overflow-visible">
			{#if $activeTab?.type === 'typst' || $activeTab?.type === 'text'}
				<TypstEditor />
			{:else if $activeTab?.type === 'julia'}
				{@const activeGroup = $juliaGroups.find(g => g.tabA === $activeTabId || g.tabB === $activeTabId)}
				{@const splitTabId = activeGroup
					? (activeGroup.tabA === $activeTabId ? activeGroup.tabB : activeGroup.tabA)
					: null}
				{#if juliaMode}
					{#if splitTabId}
						<!-- Split view: two Julia editors stacked, REPL panels on the right -->
						<div class="flex flex-col h-full">
							<div class="flex-1 min-h-0 overflow-visible">
								<JuliaEditor hideRepl={true} />
							</div>
							<div class="flex-1 min-h-0 overflow-visible">
								<JuliaEditor tabId={splitTabId} hideRepl={true} />
							</div>
						</div>
					{:else}
						<!-- Single full-height Julia editor, REPL on right -->
						<JuliaEditor hideRepl={true} />
					{/if}
				{:else}
					<!-- Normal mode: editor + embedded REPL panel at the bottom -->
					<JuliaEditor />
				{/if}
			{:else}
				<RichTextEditor />
			{/if}
		</div>
		<EditorTabs />
	</div>
</CollapsibleSidebar>
