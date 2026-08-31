/** Static topic lists for the beginner reading curriculum and the
 * intermediate/advanced grammar curriculum.
 *
 * Only ids + sidebar labels live here. Every topic ships with an English
 * lesson in `grammar-premade.ts`, so a reader without an AI subscription has
 * something to study from the first time they open it; a reader with one
 * regenerates the lesson — in any language — through
 * `ai-grammar-topic.store.ts`, which adds a version rather than replacing one.
 *
 * The beginner list is about *reading*: the script, the vowel signs, the stops
 * in the muṣḥaf, and the few sentence patterns a first reader meets. The
 * hands-on lessons (alphabet, pairing, three-letter words, long vowels,
 * tajwīd) come first in the wizard; these topics are what follows them. */

/** One morphology query: a token tag and/or feature atoms that must all be
 * present. Matches the `find_morphology_examples` command. */
export interface CorpusQuery {
    /** What this query pulls out, for the lesson's own framing. */
    label: string;
    tag?: string;
    features?: string[];
}

export interface GrammarTopic {
    id: string;
    /** Sidebar label — plain English/transliterated, so it doesn't need an
     * AI call just to populate the list. */
    label: string;
    /**
     * Where the topic's Qur'anic examples come from. The corpus knows exactly
     * where a jussive verb or an accusative particle stands, so those topics
     * hand the model verified occurrences to explain instead of letting it
     * recall its own. Rhetorical topics — iltifāt, sajʿ, ījāz — have no
     * morphological signature to query, so they carry none and the model
     * proposes examples that are then checked against the muṣḥaf.
     */
    corpus?: CorpusQuery[];
}

export const BEGINNER_TOPICS: GrammarTopic[] = [
    { id: "letter_shapes", label: "How letters join: the four shapes" },
    { id: "sukun_basics", label: "Sukūn — a letter with no vowel" },
    { id: "shaddah_basics", label: "Shaddah — the doubled letter" },
    {
        id: "tanween_basics",
        label: "Tanwīn — the indefinite ending",
        corpus: [{ label: "indefinite noun", features: ["POS:N", "INDEF"] }],
    },
    { id: "madd_basics", label: "Long vowels and how long to hold them" },
    {
        id: "sun_moon_letters",
        label: "ال with sun and moon letters",
        corpus: [{ label: "word carrying the definite article", features: ["Al+"] }],
    },
    { id: "hamzat_wasl", label: "Hamzat al-waṣl and hamzat al-qaṭʿ" },
    {
        id: "taa_marbuta",
        label: "Tāʾ marbūṭah and the feminine ending",
        corpus: [{ label: "feminine noun", features: ["POS:N", "F"] }],
    },
    { id: "waqf_signs", label: "Stopping signs in the muṣḥaf" },
    {
        id: "pronouns_beginner",
        label: "Personal pronouns",
        corpus: [{ label: "pronoun", tag: "PRON" }],
    },
    {
        id: "demonstratives_beginner",
        label: "This and that — demonstratives",
        corpus: [{ label: "demonstrative", tag: "DEM" }],
    },
    {
        id: "prepositions_beginner",
        label: "The common prepositions",
        corpus: [{ label: "preposition", tag: "P" }],
    },
    {
        id: "question_words",
        label: "Question words",
        corpus: [{ label: "interrogative", tag: "INTG" }],
    },
    {
        id: "gender_number_basics",
        label: "Masculine and feminine, one, two and many",
        corpus: [
            { label: "feminine singular noun", features: ["POS:N", "FS"] },
            { label: "masculine plural noun", features: ["POS:N", "MP"] },
        ],
    },
    {
        id: "nominal_sentence",
        label: "The nominal sentence — mubtadaʾ and khabar",
        corpus: [{ label: "nominative noun (marfūʿ)", features: ["POS:N", "NOM"] }],
    },
    {
        id: "verbal_sentence",
        label: "The verbal sentence — verb, doer, object",
        corpus: [{ label: "verb", tag: "V" }],
    },
    { id: "frequent_quran_words", label: "The words you meet most in the Qur'an" },
];

export const INTERMEDIATE_TOPICS: GrammarTopic[] = [
    {
        id: "noun_cases",
        label: "Noun cases in the Qur'an",
        corpus: [
            { label: "nominative noun (marfūʿ)", features: ["POS:N", "NOM"] },
            { label: "accusative noun (manṣūb)", features: ["POS:N", "ACC"] },
            { label: "genitive noun (majrūr)", features: ["POS:N", "GEN"] },
        ],
    },
    {
        id: "definite_article",
        label: "The definite article and assimilation",
        corpus: [
            { label: "word carrying the definite article", features: ["Al+"] },
        ],
    },
    {
        id: "idafa",
        label: "The Iḍāfa construction",
        corpus: [
            { label: "genitive noun (majrūr)", features: ["POS:N", "GEN"] },
        ],
    },
    {
        id: "inna_sisters",
        label: "إنّ and her sisters",
        corpus: [
            { label: "accusative particle", tag: "ACC" },
        ],
    },
    {
        id: "kana_sisters",
        label: "كان and her sisters",
        corpus: [
            { label: "a form of kāna", features: ["SP:kaAn"] },
        ],
    },
    {
        id: "attached_pronouns",
        label: "Attached pronouns",
        corpus: [
            { label: "attached pronoun", tag: "PRON" },
        ],
    },
    {
        id: "relative_pronouns",
        label: "Relative pronouns",
        corpus: [
            { label: "relative pronoun", tag: "REL" },
        ],
    },
    {
        id: "broken_plurals",
        label: "Broken plurals",
        corpus: [
            { label: "masculine plural noun", features: ["POS:N", "MP"] },
        ],
    },
    {
        id: "verb_forms",
        label: "The derived verb forms",
        corpus: [
            { label: "form II verb", features: ["(II)"] },
            { label: "form IV verb", features: ["(IV)"] },
            { label: "form X verb", features: ["(X)"] },
        ],
    },
    {
        id: "jussive",
        label: "Jussive mood after لَمْ",
        corpus: [
            { label: "jussive verb", features: ["MOOD:JUS"] },
        ],
    },
    {
        id: "subjunctive",
        label: "Subjunctive mood after أَنْ and لَنْ",
        corpus: [
            { label: "subjunctive verb", features: ["MOOD:SUBJ"] },
        ],
    },
    {
        id: "imperative",
        label: "The imperative",
        corpus: [
            { label: "imperative verb", features: ["IMPV"] },
        ],
    },
    {
        id: "passive_voice",
        label: "The passive voice",
        corpus: [
            { label: "passive verb", features: ["POS:V", "PASS"] },
        ],
    },
    {
        id: "participles",
        label: "Active and passive participles",
        corpus: [
            { label: "active participle", features: ["ACT", "PCPL"] },
            { label: "passive participle", features: ["PASS", "PCPL"] },
        ],
    },
    {
        id: "negation",
        label: "Negation particles",
        corpus: [
            { label: "negative particle", tag: "NEG" },
        ],
    },
    {
        id: "conditional",
        label: "Conditional sentences",
        corpus: [
            { label: "conditional particle", tag: "COND" },
        ],
    },
    { id: "comparative", label: "Comparative أَفْعَل pattern" },
];

export const ADVANCED_TOPICS: GrammarTopic[] = [
    { id: "balagha_intro", label: "Balāgha — the art of eloquence" },
    { id: "tashbih", label: "Tashbīh — simile" },
    { id: "istiara", label: "Istiʿāra — metaphor" },
    { id: "kinaya", label: "Kināya — saying it indirectly" },
    {
        id: "rhetorical_questions",
        label: "Rhetorical questions in the Qur'an",
        corpus: [
            { label: "interrogative particle", tag: "INTG" },
        ],
    },
    {
        id: "qasr",
        label: "Qaṣr — restriction and exclusivity",
        corpus: [
            { label: "restriction particle", tag: "RES" },
        ],
    },
    {
        id: "tawkid",
        label: "Tawkīd — emphasis",
        corpus: [
            { label: "emphatic particle", tag: "EMPH" },
        ],
    },
    { id: "iltifat", label: "Iltifāt — the grammatical shift of person" },
    { id: "taqdim_takhir", label: "Taqdīm & taʾkhīr — fronting for emphasis" },
    { id: "ijaz", label: "Ījāz — eloquent brevity" },
    { id: "itnab", label: "Iṭnāb — purposeful elaboration" },
    { id: "munasabah", label: "Munāsabah — how ayahs connect" },
    { id: "saj", label: "Sajʿ — rhythmic prose in early Meccan sūrahs" },
];

export function topicsForLevel(
    level: "beginner" | "intermediate" | "advanced",
): GrammarTopic[] {
    if (level === "beginner") return BEGINNER_TOPICS;
    return level === "intermediate" ? INTERMEDIATE_TOPICS : ADVANCED_TOPICS;
}
