import {
    DecoratorNode,
    type NodeKey,
    type LexicalNode,
    type EditorConfig,
    type SerializedLexicalNode,
    $applyNodeReplacement,
} from "lexical";
import type { ComponentProps } from "svelte";
import CitationComponent from "./CitationComponent.svelte";

type DecoratorCitationType = {
    componentClass: typeof CitationComponent;
    updateProps?: (props: ComponentProps<typeof CitationComponent>) => void;
};

export interface SerializedCitationNode extends SerializedLexicalNode {
    type: "citation";
    version: 1;
    /** Id of the reference (in the References library) this citation points to. */
    refId: string;
    /** Which in-text style was chosen ("numeric" | "parenthetical" | … | "custom"). */
    styleId: string;
    /** The rendered citation text (editable). */
    text: string;
}

export function $createCitationNode(
    refId: string,
    styleId: string,
    text: string,
): CitationNode {
    return $applyNodeReplacement(new CitationNode(refId, styleId, text));
}

export function $isCitationNode(
    node: LexicalNode | null | undefined,
): node is CitationNode {
    return node instanceof CitationNode;
}

/**
 * An in-text citation — an inline decorator node so it behaves like an atomic
 * token in the body (select/delete as one unit) while still being editable via
 * a double-click editor. The document's auto-maintained "References" section is
 * derived from the citation nodes present in the body, so deleting a citation
 * removes its entry from the list (see CiteMenuPlugin's sync).
 */
export class CitationNode extends DecoratorNode<DecoratorCitationType> {
    __refId: string;
    __styleId: string;
    __text: string;

    constructor(refId: string, styleId: string, text: string, key?: NodeKey) {
        super(key);
        this.__refId = refId;
        this.__styleId = styleId;
        this.__text = text;
    }

    static getType(): string {
        return "citation";
    }

    static clone(node: CitationNode): CitationNode {
        // Used for copy/paste.
        return new CitationNode(
            node.__refId,
            node.__styleId,
            node.__text,
            node.__key,
        );
    }

    static importJSON(serialized: SerializedCitationNode): CitationNode {
        return $createCitationNode(
            serialized.refId,
            serialized.styleId ?? "custom",
            serialized.text ?? "",
        );
    }

    exportJSON(): SerializedCitationNode {
        return {
            type: "citation",
            version: 1,
            refId: this.__refId,
            styleId: this.__styleId,
            text: this.__text,
        };
    }

    createDOM(config: EditorConfig): HTMLElement {
        const dom = document.createElement("span");
        dom.className =
            config.theme.citationInline || "SL_Theme__citation_inline";
        return dom;
    }

    updateDOM(): boolean {
        return false;
    }

    // ── Data accessors ────────────────────────────────────────────────────
    getRefId(): string {
        return this.__refId;
    }

    getStyleId(): string {
        return this.__styleId;
    }

    getCitationText(): string {
        return this.__text;
    }

    setCitation(styleId: string, text: string): void {
        const writable = this.getWritable();
        writable.__styleId = styleId;
        writable.__text = text;
    }

    /** Copy/plain-text/search all see the rendered citation text. */
    getTextContent(): string {
        return this.__text;
    }

    decorate(): DecoratorCitationType {
        return {
            componentClass: CitationComponent,
            updateProps: (props) => {
                props.refId = this.__refId;
                props.styleId = this.__styleId;
                props.text = this.__text;
                props.nodeKey = this.__key;
            },
        };
    }
}
