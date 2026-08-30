/**
 * Per-part-of-speech color coding shared by every place that renders a
 * morphology tag as a chip — the word popover and the Arabic Study Verse
 * Study canvas. Single source of truth so the two never drift apart.
 */
export type TokenStyle = {
    bg: string;
    border: string;
    badge: string;
    text: string;
    dot: string;
    accent: string;
};

export const TOKEN_STYLES: Record<string, TokenStyle> = {
    N:    { bg: "bg-sky-50/60 dark:bg-sky-900/20",     border: "border-sky-200 dark:border-sky-700/40",     badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",       text: "text-sky-700 dark:text-sky-300",     dot: "bg-sky-400 dark:bg-sky-500",     accent: "bg-sky-400 dark:bg-sky-600"    },
    V:    { bg: "bg-emerald-50/60 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-700/40", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-400 dark:bg-emerald-500", accent: "bg-emerald-400 dark:bg-emerald-600" },
    P:    { bg: "bg-violet-50/60 dark:bg-violet-900/20",  border: "border-violet-200 dark:border-violet-700/40",  badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",  text: "text-violet-700 dark:text-violet-300",  dot: "bg-violet-400 dark:bg-violet-500",  accent: "bg-violet-400 dark:bg-violet-600"  },
    PN:   { bg: "bg-indigo-50/60 dark:bg-indigo-900/20",  border: "border-indigo-200 dark:border-indigo-700/40",  badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",  text: "text-indigo-700 dark:text-indigo-300",  dot: "bg-indigo-400 dark:bg-indigo-500",  accent: "bg-indigo-400 dark:bg-indigo-600"  },
    ADJ:  { bg: "bg-amber-50/60 dark:bg-amber-900/20",   border: "border-amber-200 dark:border-amber-700/40",   badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",    text: "text-amber-700 dark:text-amber-300",   dot: "bg-amber-400 dark:bg-amber-500",   accent: "bg-amber-400 dark:bg-amber-600"   },
    DET:  { bg: "bg-slate-50/60 dark:bg-slate-700/20",   border: "border-slate-200 dark:border-slate-600/40",   badge: "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300",    text: "text-slate-600 dark:text-slate-300",   dot: "bg-slate-400 dark:bg-slate-500",   accent: "bg-slate-300 dark:bg-slate-600"   },
    PRON: { bg: "bg-rose-50/60 dark:bg-rose-900/20",    border: "border-rose-200 dark:border-rose-700/40",    badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",      text: "text-rose-700 dark:text-rose-300",    dot: "bg-rose-400 dark:bg-rose-500",    accent: "bg-rose-400 dark:bg-rose-600"    },
    REL:  { bg: "bg-rose-50/60 dark:bg-rose-900/20",    border: "border-rose-200 dark:border-rose-700/40",    badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",      text: "text-rose-700 dark:text-rose-300",    dot: "bg-rose-400 dark:bg-rose-500",    accent: "bg-rose-400 dark:bg-rose-600"    },
    DEM:  { bg: "bg-rose-50/60 dark:bg-rose-900/20",    border: "border-rose-200 dark:border-rose-700/40",    badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",      text: "text-rose-700 dark:text-rose-300",    dot: "bg-rose-400 dark:bg-rose-500",    accent: "bg-rose-400 dark:bg-rose-600"    },
    CONJ: { bg: "bg-orange-50/60 dark:bg-orange-900/20",  border: "border-orange-200 dark:border-orange-700/40",  badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",  text: "text-orange-700 dark:text-orange-300",  dot: "bg-orange-400 dark:bg-orange-500",  accent: "bg-orange-400 dark:bg-orange-600"  },
    NEG:  { bg: "bg-red-50/60 dark:bg-red-900/20",     border: "border-red-200 dark:border-red-700/40",     badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",        text: "text-red-700 dark:text-red-300",     dot: "bg-red-400 dark:bg-red-500",     accent: "bg-red-400 dark:bg-red-600"     },
};

export const DEFAULT_TOKEN_STYLE: TokenStyle = {
    bg: "bg-slate-50/60 dark:bg-slate-700/20", border: "border-slate-200 dark:border-slate-600/40",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300", text: "text-slate-600 dark:text-slate-300",
    dot: "bg-slate-400 dark:bg-slate-500", accent: "bg-slate-300 dark:bg-slate-600",
};

export function getTokenStyle(tag: string): TokenStyle {
    return TOKEN_STYLES[tag] ?? DEFAULT_TOKEN_STYLE;
}

// Value lookup table aligned with MorphologyDetails.md — used as a fallback
// when a locale hasn't got a `morphology.pos.<TAG>` translation yet.
export const POS_LABELS: Record<string, string> = {
    N:           'Noun',
    PN:          'Proper noun',
    ADJ:         'Adjective',
    IMPN:        'Imperative verbal noun',
    PRON:        'Personal pronoun',
    DEM:         'Demonstrative pronoun',
    REL:         'Relative pronoun',
    T:           'Time adverb',
    LOC:         'Location adverb',
    P:           'Preposition',
    EMPH:        'Emphatic lam prefix',
    IMPV:        'Imperative lam prefix',
    PRP:         'Purpose lam prefix',
    CONJ:        'Coordinating conjunction',
    SUB:         'Subordinating particle',
    ACC:         'Accusative particle',
    AMD:         'Amendment particle',
    ANS:         'Answer particle',
    AVR:         'Aversion particle',
    CAUS:        'Particle of cause',
    CERT:        'Particle of certainty',
    CIRC:        'Circumstantial particle',
    COM:         'Comitative particle',
    COND:        'Conditional particle',
    EQ:          'Equalization particle',
    EXH:         'Exhortation particle',
    EXL:         'Explanation particle',
    EXP:         'Exceptive particle',
    FUT:         'Future particle',
    INC:         'Inceptive particle',
    INT:         'Interpretation particle',
    INTG:        'Interrogative particle',
    NEG:         'Negative particle',
    PREV:        'Preventive particle',
    PRO:         'Prohibition particle',
    REM:         'Resumption particle',
    RES:         'Restriction particle',
    RET:         'Retraction particle',
    RSLT:        'Result particle',
    SUP:         'Supplemental particle',
    SUR:         'Surprise particle',
    VOC:         'Vocative particle',
    INL:         'Quranic initials',
    V:           'Verb',
    VN:          'Verbal noun',
    'ACT PCPL':  'Active participle',
    'PASS PCPL': 'Passive participle',
    DET:         'Determiner',
};
