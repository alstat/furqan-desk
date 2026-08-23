<!--
  The AI chat as its own OS window.

  This window boots a fresh JS context. The Supabase session and the chat
  history it keys off both live outside memory — the session in localStorage,
  the chats on the server — so the chat restores itself here without anything
  being handed over.

  The exception is "ask about this selection", which starts from a selection in
  the main window. That payload is left in localStorage before this window is
  opened (see askAiAboutSelection) and collected below: once on boot, and again
  on the storage event for each later selection while the window stays open.
-->
<script lang="ts">
    import { onMount } from "svelte";
    import AiChatDialog from "$lib/components/shared/AiChatDialog.svelte";
    import {
        pendingSelectionQuestion,
        takePendingSelectionQuestion,
    } from "$lib/stores/ai-chat.store";

    onMount(() => {
        const collect = () => {
            const pending = takePendingSelectionQuestion();
            if (pending) pendingSelectionQuestion.set(pending);
        };
        collect();

        // Storage events fire in *other* windows on the origin, which is
        // exactly the direction needed: the main window leaves a question, this
        // one picks it up.
        const onStorage = (e: StorageEvent) => {
            if (e.key === "aiChatPendingQuestion" && e.newValue) collect();
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    });

    async function closeWindow() {
        try {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            await getCurrentWindow().close();
        } catch {
            // Outside Tauri there is no window to close; leave the chat up.
        }
    }
</script>

<svelte:head>
    <title>AI Chat</title>
</svelte:head>

<AiChatDialog open={true} standalone={true} onClose={closeWindow} />
