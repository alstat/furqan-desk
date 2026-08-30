/** Static topic lists for the intermediate/advanced grammar curriculum.
 *
 * Only ids + sidebar labels live here — every topic's actual explanation,
 * examples, and quiz are generated on demand by `ai-grammar-topic.store.ts`
 * and cached, not hand-authored, per the original brief's instruction to use
 * AI for tailored grammar explanations at these levels. */

export interface GrammarTopic {
    id: string;
    /** Sidebar label — plain English/transliterated, so it doesn't need an
     * AI call just to populate the list. */
    label: string;
}

export const INTERMEDIATE_TOPICS: GrammarTopic[] = [
    { id: "noun_cases", label: "Noun cases in the Qur'an" },
    { id: "inna_sisters", label: "إنّ and her sisters" },
    { id: "idafa", label: "The Iḍāfa construction" },
    { id: "jussive", label: "Jussive mood after لَمْ" },
    { id: "comparative", label: "Comparative أَفْعَل pattern" },
    { id: "definite_article", label: "The definite article and assimilation" },
];

export const ADVANCED_TOPICS: GrammarTopic[] = [
    { id: "balagha_intro", label: "Balāgha — the art of eloquence" },
    { id: "rhetorical_questions", label: "Rhetorical questions in the Qur'an" },
    { id: "iltifat", label: "Iltifāt — the grammatical shift of person" },
    { id: "taqdim_takhir", label: "Taqdīm & taʾkhīr — fronting for emphasis" },
    { id: "ijaz", label: "Ījāz — eloquent brevity" },
    { id: "saj", label: "Sajʿ — rhythmic prose in early Meccan sūrahs" },
];

export function topicsForLevel(level: "intermediate" | "advanced"): GrammarTopic[] {
    return level === "intermediate" ? INTERMEDIATE_TOPICS : ADVANCED_TOPICS;
}
