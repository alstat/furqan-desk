import {
    DecoratorNode,
    $getRoot as getRoot,
    type NodeKey,
    type LexicalNode,
    type EditorConfig,
    type SerializedLexicalNode,
    $applyNodeReplacement,
} from "lexical";
import type { ComponentProps } from "svelte";
import ReferenceListComponent from "./ReferenceListComponent.svelte";
import type { BibStyle } from "$lib/utils/references";

type DecoratorReferenceListType = {
    componentClass: typeof ReferenceListComponent;
    updateProps?: (
        props: ComponentProps<typeof ReferenceListComponent>,
    ) => void;
};

export interface SerializedReferenceListNode extends SerializedLexicalNode {
    type: "reference-list";
    version: 1;
    /** Ordered reference ids (order of first citation). */
    refIds: string[];
    /** Selected bibliography style. */
    style: BibStyle;
}

export function $createReferenceListNode(
    refIds: string[] = [],
    style: BibStyle = "apa",
): ReferenceListNode {
    return $applyNodeReplacement(new ReferenceListNode(refIds, style));
}

export function $isReferenceListNode(
    node: LexicalNode | null | undefined,
): node is ReferenceListNode {
    return node instanceof ReferenceListNode;
}

/** The single reference-list node in the document, if one exists. */
export function $getReferenceListNode(): ReferenceListNode | null {
    for (const child of getRoot().getChildren()) {
        if ($isReferenceListNode(child)) return child;
    }
    return null;
}

/**
 * Return the document's reference-list node, creating and appending one at the
 * end of the document if it doesn't exist yet.
 */
export function $getOrCreateReferenceListNode(): ReferenceListNode {
    const existing = $getReferenceListNode();
    if (existing) return existing;
    const node = $createReferenceListNode();
    getRoot().append(node);
    return node;
}

/**
 * Register a cited reference into the document's reference list (deduplicated,
 * preserving first-citation order). Creates the list if needed.
 */
export function $addReferenceToList(refId: string): void {
    if (!refId) return;
    const node = $getOrCreateReferenceListNode();
    node.addRef(refId);
}

export class ReferenceListNode extends DecoratorNode<DecoratorReferenceListType> {
    __refIds: string[];
    __style: BibStyle;

    constructor(refIds: string[], style: BibStyle, key?: NodeKey) {
        super(key);
        this.__refIds = [...refIds];
        this.__style = style;
    }

    static getType(): string {
        return "reference-list";
    }

    static clone(node: ReferenceListNode): ReferenceListNode {
        return new ReferenceListNode(node.__refIds, node.__style, node.__key);
    }

    static importJSON(
        serialized: SerializedReferenceListNode,
    ): ReferenceListNode {
        return $createReferenceListNode(
            Array.isArray(serialized.refIds) ? serialized.refIds : [],
            serialized.style ?? "apa",
        );
    }

    exportJSON(): SerializedReferenceListNode {
        return {
            type: "reference-list",
            version: 1,
            refIds: [...this.__refIds],
            style: this.__style,
        };
    }

    createDOM(config: EditorConfig): HTMLElement {
        const dom = document.createElement("div");
        dom.className =
            config.theme.referenceList || "SL_Theme__reference_list";
        return dom;
    }

    updateDOM(): boolean {
        return false;
    }

    // ── Data accessors ────────────────────────────────────────────────────
    getRefIds(): string[] {
        return [...this.__refIds];
    }

    addRef(refId: string): void {
        if (this.__refIds.includes(refId)) return;
        const writable = this.getWritable();
        writable.__refIds = [...writable.__refIds, refId];
    }

    setRefIds(refIds: string[]): void {
        const writable = this.getWritable();
        writable.__refIds = [...refIds];
    }

    getStyle(): BibStyle {
        return this.__style;
    }

    setStyle(style: BibStyle): void {
        const writable = this.getWritable();
        writable.__style = style;
    }

    decorate(): DecoratorReferenceListType {
        return {
            componentClass: ReferenceListComponent,
            updateProps: (props) => {
                props.refIds = this.__refIds;
                props.style = this.__style;
                props.nodeKey = this.__key;
            },
        };
    }
}
