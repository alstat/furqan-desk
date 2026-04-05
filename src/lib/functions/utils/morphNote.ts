import type { MorphWord } from '$lib/types/morphology';
import { buckwalterToArabic } from './utils';

// ── Lookup tables (mirrors WordMorphologyPopover) ────────────────────────────

const POS_LABELS: Record<string, string> = {
    N: 'Noun', PN: 'Proper noun', ADJ: 'Adjective', IMPN: 'Imperative verbal noun',
    PRON: 'Personal pronoun', DEM: 'Demonstrative pronoun', REL: 'Relative pronoun',
    T: 'Time adverb', LOC: 'Location adverb', P: 'Preposition',
    EMPH: 'Emphatic lam prefix', IMPV: 'Imperative lam prefix', PRP: 'Purpose lam prefix',
    CONJ: 'Coordinating conjunction', SUB: 'Subordinating particle',
    ACC: 'Accusative particle', AMD: 'Amendment particle', ANS: 'Answer particle',
    AVR: 'Aversion particle', CAUS: 'Particle of cause', CERT: 'Particle of certainty',
    CIRC: 'Circumstantial particle', COM: 'Comitative particle', COND: 'Conditional particle',
    EQ: 'Equalization particle', EXH: 'Exhortation particle', EXL: 'Explanation particle',
    EXP: 'Exceptive particle', FUT: 'Future particle', INC: 'Inceptive particle',
    INT: 'Interpretation particle', INTG: 'Interrogative particle', NEG: 'Negative particle',
    PREV: 'Preventive particle', PRO: 'Prohibition particle', REM: 'Resumption particle',
    RES: 'Restriction particle', RET: 'Retraction particle', RSLT: 'Result particle',
    SUP: 'Supplemental particle', SUR: 'Surprise particle', VOC: 'Vocative particle',
    INL: 'Quranic initials', V: 'Verb', VN: 'Verbal noun',
    'ACT PCPL': 'Active participle', 'PASS PCPL': 'Passive participle', DET: 'Determiner',
};

const PERSON_LABELS: Record<string, string> = {
    '1st': 'First person', '2nd': 'Second person', '3rd': 'Third person',
};

const DERIVATION_LABELS: Record<string, string> = {
    '(I)': 'Form I', '(II)': 'Form II', '(III)': 'Form III', '(IV)': 'Form IV',
    '(V)': 'Form V', '(VI)': 'Form VI', '(VII)': 'Form VII', '(VIII)': 'Form VIII',
    '(IX)': 'Form IX', '(X)': 'Form X', '(XI)': 'Form XI', '(XII)': 'Form XII',
};

const PREFIX_LABELS: Record<string, string> = {
    Al: 'Definite article (al-)', bi: 'Preposition (bi-)',
    'l:P': 'Preposition (li-)', 'l:EMPH': 'Emphatic lam (la-)',
    'l:IMPV': 'Imperative lam (li-)', 'l:PRP': 'Purpose lam (li-)',
    'w:CONJ': 'Conjunction (wa-)', 'f:CONJ': 'Conjunction (fa-)',
    'w:P': 'Preposition (wa-)', 'k:P': 'Preposition (ka-)',
    sa: 'Future particle (sa-)', ta: 'Oath particle (ta-)',
};

const SUFFIX_LABELS: Record<string, string> = {
    '3MS': '3rd masc. sg.', '3FS': '3rd fem. sg.',
    '3MD': '3rd masc. dual', '3FD': '3rd fem. dual',
    '3MP': '3rd masc. pl.', '3FP': '3rd fem. pl.',
    '2MS': '2nd masc. sg.', '2FS': '2nd fem. sg.',
    '2MD': '2nd masc. dual', '2FD': '2nd fem. dual',
    '2MP': '2nd masc. pl.', '2FP': '2nd fem. pl.',
    '1S': '1st sg.', '1D': '1st dual', '1P': '1st pl.',
};

const MOOD_LABELS: Record<string, string> = {
    IND: 'Indicative', JUS: 'Jussive', SUBJ: 'Subjunctive',
};

// ── Formatter ────────────────────────────────────────────────────────────────

/**
 * Produces a plain-text morphology summary for a word, suitable for
 * pre-filling the note field in HighlightSaveDialog.
 *
 * Pass `tFn` (e.g. `get(t)` from the i18n store) to get translated labels.
 * When omitted, falls back to English.
 *
 * Example output (single-token word):
 *   Noun — رَبِّ (rb~i)
 *   Root: ربب  |  Lemma: ربّ
 *   Gender: Masculine  |  Number: Singular  |  Case: Genitive  |  State: Construct
 *
 * Multi-token words get one block per token separated by a blank line.
 */
export function formatMorphNote(word: MorphWord, tFn?: (key: string) => string): string {
    const _ = (key: string, fallback: string): string =>
        tFn ? (tFn(key) || fallback) : fallback;

    const blocks = word.tokens.map((token, i) => {
        const lines: string[] = [];

        const prefix = word.tokens.length > 1 ? `${_('morphology.token', 'Token')} ${i + 1} — ` : '';
        lines.push(`${prefix}${token.tag_name} — ${token.form_arabic} (${token.form_buckwalter})`);

        const f = token.features;

        // Root / Lemma on one line (Arabic script)
        const rootLine: string[] = [];
        if (f.root)  rootLine.push(`${_('morphology.feat.root', 'Root')}: ${buckwalterToArabic(f.root)}`);
        if (f.lemma) rootLine.push(`${_('morphology.feat.lemma', 'Lemma')}: ${buckwalterToArabic(f.lemma)}`);
        if (rootLine.length) lines.push(rootLine.join('  |  '));

        // POS + morphological features on one line
        const featLine: string[] = [];
        if (f.pos)         featLine.push(tFn ? (tFn(`morphology.pos.${f.pos.replace(' ', '_')}`) || POS_LABELS[f.pos] || f.pos) : (POS_LABELS[f.pos] ?? f.pos));
        if (f.derivation)  featLine.push(tFn ? (tFn(`morphology.form.${f.derivation.replace(/[()]/g, '')}`) || DERIVATION_LABELS[f.derivation] || f.derivation) : (DERIVATION_LABELS[f.derivation] ?? f.derivation));
        if (f.person)      featLine.push(tFn ? (tFn(`morphology.person.${f.person}`) || PERSON_LABELS[f.person] || f.person) : (PERSON_LABELS[f.person] ?? f.person));
        if (f.gender)      featLine.push(tFn ? (tFn(`morphology.gender.${f.gender}`)    || f.gender)    : f.gender);
        if (f.number)      featLine.push(tFn ? (tFn(`morphology.number.${f.number}`)    || f.number)    : f.number);
        if (f.case_type)   featLine.push(tFn ? (tFn(`morphology.case.${f.case_type}`)   || f.case_type) : f.case_type);
        if (f.state)       featLine.push(tFn ? (tFn(`morphology.state.${f.state}`)      || f.state)     : f.state);
        if (f.aspect)      featLine.push(tFn ? (tFn(`morphology.aspect.${f.aspect}`)    || f.aspect)    : f.aspect);
        if (f.voice)       featLine.push(tFn ? (tFn(`morphology.voice.${f.voice}`)      || f.voice)     : f.voice);
        if (f.mood)        featLine.push(tFn ? (tFn(`morphology.mood.${f.mood}`) || MOOD_LABELS[f.mood] || f.mood) : (MOOD_LABELS[f.mood] ?? f.mood));
        if (f.prefix_type) featLine.push(`${_('morphology.feat.prefix', 'Prefix')}: ${tFn ? (tFn(`morphology.prefix.${f.prefix_type.replace(/:/g, '_')}`) || PREFIX_LABELS[f.prefix_type] || f.prefix_type) : (PREFIX_LABELS[f.prefix_type] ?? f.prefix_type)}`);
        if (f.suffix_type) featLine.push(`${_('morphology.feat.suffix', 'Suffix')}: ${tFn ? (tFn(`morphology.suffix.${f.suffix_type}`) || SUFFIX_LABELS[f.suffix_type] || f.suffix_type) : (SUFFIX_LABELS[f.suffix_type] ?? f.suffix_type)}`);
        if (featLine.length) lines.push(featLine.join('  |  '));

        return lines.join('\n');
    });

    return blocks.join('\n\n');
}
