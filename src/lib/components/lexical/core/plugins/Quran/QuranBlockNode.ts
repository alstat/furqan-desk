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
}

export function $createQuranBlockNode(verses: QuranVerse[]): QuranBlockNode {
    return $applyNodeReplacement(new QuranBlockNode(verses));
}

export function $isQuranBlockNode(
    node: LexicalNode | null | undefined,
): node is QuranBlockNode {
    return node instanceof QuranBlockNode;
}

export class QuranBlockNode extends DecoratorNode<DecoratorQuranType> {
    __verses: QuranVerse[];

    constructor(verses: QuranVerse[], key?: NodeKey) {
        super(key);
        this.__verses = verses;
    }

    static getType(): string {
        return "quran-block";
    }

    static clone(node: QuranBlockNode): QuranBlockNode {
        return new QuranBlockNode(node.__verses, node.__key);
    }

    static importJSON(serialized: SerializedQuranBlockNode): QuranBlockNode {
        return $createQuranBlockNode(serialized.verses ?? []);
    }

    exportJSON(): SerializedQuranBlockNode {
        return {
            type: "quran-block",
            version: 1,
            verses: this.__verses,
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

    decorate(): DecoratorQuranType {
        return {
            componentClass: QuranBlock,
            updateProps: (props) => {
                props.verses = this.__verses;
            },
        };
    }
}
