export interface ParsedFeatures {
	pos: string | null;
	lemma: string | null;
	root: string | null;
	gender: string | null;
	number: string | null;
	case_type: string | null;
	person: string | null;
	voice: string | null;
	mood: string | null;
	aspect: string | null;
	state: string | null;
	derivation: string | null;
	prefix_type: string | null;
	suffix_type: string | null;
	raw: string;
}

export interface MorphToken {
	token: number;
	form_buckwalter: string;
	form_arabic: string;
	tag: string;
	tag_name: string;
	features: ParsedFeatures;
}

export interface MorphWord {
	word: number;
	tokens: MorphToken[];
	combined_arabic: string;
}

export interface AyahMorphology {
	ayah: number;
	words: MorphWord[];
}

export interface SurahMorphology {
	surah: number;
	ayahs: AyahMorphology[];
}
