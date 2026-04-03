<script lang="ts">
    import { onMount } from "svelte";
    import { invoke } from "@tauri-apps/api/core";
    import { openUrl } from "@tauri-apps/plugin-opener";
    import Icon from "@iconify/svelte";
    import { fade } from "svelte/transition";
    import { t } from "$lib/i18n";

    interface BlogPost {
        title: string;
        date: string;
        author: string;
        post_url: string;
    }

    let visible = $state(false);
    let post = $state<BlogPost | null>(null);

    onMount(() => {
        setTimeout(async () => {
            try {
                const result = await invoke<BlogPost | null>(
                    "check_new_blog_post",
                );
                if (result) {
                    post = result;
                    visible = true;
                }
            } catch {
                // silently ignore — network errors, etc.
            }
        }, 2000);
    });

    async function handleSeePost() {
        if (!post) return;
        try {
            await openUrl(post.post_url);
            await invoke("mark_blog_post_seen", {
                title: post.title,
                date: post.date,
                author: post.author,
                postUrl: post.post_url,
            });
        } catch {
            // silently ignore
        }
        visible = false;
    }
</script>

{#if visible && post}
    <div
        transition:fade={{ duration: 200 }}
        class="fixed top-30 right-5 z-[9999] flex items-start gap-3 px-4 py-3
                rounded-3xl w-2xs
                bg-white/90 dark:bg-[#292c3c]/95
                backdrop-blur-md
                border border-brand-sand-200 dark:border-[#414559]
                shadow-lg shadow-stone-300/30 dark:shadow-black/40"
    >
        <Icon
            icon="solar:document-bold-duotone"
            width="1.1rem"
            class="shrink-0 mt-0.5 text-brand-gold-500 dark:text-[#e5c890]"
        />
        <div class="flex-1 min-w-0">
            <p
                class="text-xs font-semibold text-brand-charcoal-700 dark:text-[#c6d0f5]"
            >
                {$t("blog.title")}
            </p>
            <p
                class="text-[11px] text-brand-charcoal-400 dark:text-[#838ba7] mt-0.5"
            >
                {$t("blog.message", { title: post.title, author: post.author })}
            </p>
            <button
                class="mt-2 text-[11px] cursor-pointer font-medium text-brand-gold-600 dark:text-[#e5c890]
                       hover:underline"
                onclick={handleSeePost}
            >
                {$t("blog.see_post")}
            </button>
        </div>
        <button
            onclick={() => (visible = false)}
            class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg text-brand-charcoal-300 dark:text-[#626880] hover:text-brand-gold-600 dark:hover:text-[#e5c890] transition-colors"
            aria-label="Dismiss"
        >
            <Icon icon="solar:close-circle-bold-duotone" width="1rem" />
        </button>
    </div>
{/if}
