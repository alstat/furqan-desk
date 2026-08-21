import {
    $applyNodeReplacement,
    DecoratorNode,
    type EditorConfig,
    type LexicalNode,
    type NodeKey,
    type SerializedLexicalNode,
} from 'lexical';
import LeanCellComponent from './LeanCellComponent.svelte';
import type { ComponentProps } from 'svelte';
import type { LeanDiagnostic } from '$lib/stores/lean-compiler.store';

type DecoratorLeanCellType = {
    componentClass: typeof LeanCellComponent;
    updateProps?: (props: ComponentProps<typeof LeanCellComponent>) => void;
};

/** Which part of a cell is shown — and consequently exported to DOCX. */
export type LeanCellDisplayMode = 'both' | 'code' | 'output';

export interface SerializedLeanCellNode extends SerializedLexicalNode {
    code: string;
    diagnostics: LeanDiagnostic[];
    raw: string;
    ok: boolean;
    elapsedMs: number;
    displayMode: LeanCellDisplayMode;
    type: 'lean-cell';
    version: 1;
}

export function $createLeanCellNode(
    code = '',
    diagnostics: LeanDiagnostic[] = [],
    raw = '',
    ok = true,
    elapsedMs = 0,
    displayMode: LeanCellDisplayMode = 'both',
    autoEdit = false,
): LeanCellNode {
    return $applyNodeReplacement(
        new LeanCellNode(
            code,
            diagnostics,
            raw,
            ok,
            elapsedMs,
            displayMode,
            undefined,
            autoEdit,
        ),
    );
}

export function $isLeanCellNode(node: LexicalNode | null | undefined): node is LeanCellNode {
    return node instanceof LeanCellNode;
}

/**
 * A Lean 4 code cell: editable source plus the elaborator messages from its
 * most recent compile. Lean is a batch compiler rather than a REPL, so a cell
 * holds a *compile result* (diagnostics + any non-diagnostic output) rather
 * than captured stdout — `#eval` and `#check` results arrive as `information`
 * diagnostics, which is what makes the cell useful as a scratchpad.
 *
 * Cells compile against the `"cell"` runtime, independent of the runtime
 * backing the standalone .lean editor's infoview.
 */
export class LeanCellNode extends DecoratorNode<DecoratorLeanCellType> {
    __code: string;
    __diagnostics: LeanDiagnostic[];
    __raw: string;
    __ok: boolean;
    __elapsedMs: number;
    __displayMode: LeanCellDisplayMode;
    __autoEdit: boolean;

    constructor(
        code: string,
        diagnostics: LeanDiagnostic[],
        raw: string,
        ok: boolean,
        elapsedMs: number,
        displayMode: LeanCellDisplayMode = 'both',
        key?: NodeKey,
        autoEdit = false,
    ) {
        super(key);
        this.__code = code;
        this.__diagnostics = diagnostics;
        this.__raw = raw;
        this.__ok = ok;
        this.__elapsedMs = elapsedMs;
        this.__displayMode = displayMode;
        this.__autoEdit = autoEdit;
    }

    static getType(): string {
        return 'lean-cell';
    }

    static clone(node: LeanCellNode): LeanCellNode {
        return new LeanCellNode(
            node.__code,
            node.__diagnostics,
            node.__raw,
            node.__ok,
            node.__elapsedMs,
            node.__displayMode,
            node.__key,
            node.__autoEdit,
        );
    }

    static importJSON(serializedNode: SerializedLeanCellNode): LeanCellNode {
        return $createLeanCellNode(
            serializedNode.code,
            serializedNode.diagnostics ?? [],
            serializedNode.raw ?? '',
            serializedNode.ok ?? true,
            serializedNode.elapsedMs ?? 0,
            serializedNode.displayMode ?? 'both',
        );
    }

    exportJSON(): SerializedLeanCellNode {
        return {
            code: this.__code,
            diagnostics: this.__diagnostics,
            raw: this.__raw,
            ok: this.__ok,
            elapsedMs: this.__elapsedMs,
            displayMode: this.__displayMode,
            type: 'lean-cell',
            version: 1,
        };
    }

    createDOM(_config: EditorConfig): HTMLElement {
        const div = document.createElement('div');
        div.setAttribute('dir', 'ltr');
        return div;
    }

    updateDOM(): boolean {
        return false;
    }

    isInline(): false {
        return false;
    }

    setCode(code: string): void {
        this.getWritable().__code = code;
    }

    getCode(): string {
        return this.__code;
    }

    getDiagnostics(): LeanDiagnostic[] {
        return this.__diagnostics;
    }

    setResult(
        diagnostics: LeanDiagnostic[],
        raw: string,
        ok: boolean,
        elapsedMs: number,
    ): void {
        const writable = this.getWritable();
        writable.__diagnostics = diagnostics;
        writable.__raw = raw;
        writable.__ok = ok;
        writable.__elapsedMs = elapsedMs;
    }

    setDisplayMode(mode: LeanCellDisplayMode): void {
        this.getWritable().__displayMode = mode;
    }

    getDisplayMode(): LeanCellDisplayMode {
        return this.__displayMode;
    }

    setAutoEdit(value: boolean): void {
        this.getWritable().__autoEdit = value;
    }

    decorate(): DecoratorLeanCellType {
        return {
            componentClass: LeanCellComponent,
            updateProps: (props) => {
                props.code = this.__code;
                props.diagnostics = this.__diagnostics;
                props.raw = this.__raw;
                props.ok = this.__ok;
                props.elapsedMs = this.__elapsedMs;
                props.displayMode = this.__displayMode;
                props.nodeKey = this.__key;
                props.autoEdit = this.__autoEdit;
            },
        };
    }
}
