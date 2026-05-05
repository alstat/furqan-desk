import {
    DecoratorNode,
    type NodeKey,
    type LexicalNode,
    type EditorConfig,
    type SerializedLexicalNode,
    $applyNodeReplacement,
} from "lexical";
import QuranBlock from "./QuranBlock.svelte";
import type { ComponentProps } from "svelte";

export interface QuranVerse {
    surah: number;
    ayah: number;
    arabic: string;
}

type DecoratorQuranType = {
    componentClass: typeof QuranBlock;
    updateProps?: (props: ComponentProps<typeof QuranBlock>) => void;
};

export interface SerializedQuranBlockNode extends SerializedLexicalNode {
    type: "quran-block";
    version: 1;
    verses: QuranVerse[];
    fontScale?: number;
}

export const QURAN_FONT_SCALE_DEFAULT = 1;
export const QURAN_FONT_SCALE_MIN = 0.7;
export const QURAN_FONT_SCALE_MAX = 2.0;
export const QURAN_FONT_SCALE_STEP = 0.1;

function clampScale(s: number): number {
    if (!Number.isFinite(s)) return QURAN_FONT_SCALE_DEFAULT;
    return Math.min(QURAN_FONT_SCALE_MAX, Math.max(QURAN_FONT_SCALE_MIN, s));
}

export function $createQuranBlockNode(
    verses: QuranVerse[],
    fontScale: number = QURAN_FONT_SCALE_DEFAULT,
): QuranBlockNode {
    return $applyNodeReplacement(new QuranBlockNode(verses, fontScale));
}

export function $isQuranBlockNode(
    node: LexicalNode | null | undefined,
): node is QuranBlockNode {
    return node instanceof QuranBlockNode;
}

export class QuranBlockNode extends DecoratorNode<DecoratorQuranType> {
    __verses: QuranVerse[];
    __fontScale: number;

    constructor(
        verses: QuranVerse[],
        fontScale: number = QURAN_FONT_SCALE_DEFAULT,
        key?: NodeKey,
    ) {
        super(key);
        this.__verses = verses;
        this.__fontScale = clampScale(fontScale);
    }

    static getType(): string {
        return "quran-block";
    }

    static clone(node: QuranBlockNode): QuranBlockNode {
        return new QuranBlockNode(node.__verses, node.__fontScale, node.__key);
    }

    static importJSON(serialized: SerializedQuranBlockNode): QuranBlockNode {
        return $createQuranBlockNode(
            serialized.verses ?? [],
            serialized.fontScale ?? QURAN_FONT_SCALE_DEFAULT,
        );
    }

    exportJSON(): SerializedQuranBlockNode {
        return {
            type: "quran-block",
            version: 1,
            verses: this.__verses,
            fontScale: this.__fontScale,
        };
    }

    createDOM(_config: EditorConfig): HTMLElement {
        const dom = document.createElement("div");
        dom.className = "quran-block-host";
        return dom;
    }

    updateDOM(): boolean {
        return false;
    }

    getVerses(): QuranVerse[] {
        return this.__verses;
    }

    getFontScale(): number {
        return this.__fontScale;
    }

    setFontScale(scale: number): void {
        const writable = this.getWritable();
        writable.__fontScale = clampScale(scale);
    }

    decorate(): DecoratorQuranType {
        return {
            componentClass: QuranBlock,
            updateProps: (props) => {
                props.verses = this.__verses;
                props.fontScale = this.__fontScale;
                props.nodeKey = this.__key;
            },
        };
    }
}
