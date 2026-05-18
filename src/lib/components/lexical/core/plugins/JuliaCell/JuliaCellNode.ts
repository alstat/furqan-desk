import {
    $applyNodeReplacement,
    DecoratorNode,
    type EditorConfig,
    type LexicalNode,
    type NodeKey,
    type SerializedLexicalNode,
} from 'lexical';
import JuliaCellComponent from './JuliaCellComponent.svelte';
import type { ComponentProps } from 'svelte';
import type { JuliaCellPlot } from '$lib/stores/julia-notebook';

type DecoratorJuliaCellType = {
    componentClass: typeof JuliaCellComponent;
    updateProps?: (props: ComponentProps<typeof JuliaCellComponent>) => void;
};

/** Which part of a cell is shown — and consequently exported to DOCX. */
export type JuliaCellDisplayMode = 'both' | 'code' | 'output';

export interface SerializedJuliaCellNode extends SerializedLexicalNode {
    code: string;
    output: string;
    hasError: boolean;
    plots: JuliaCellPlot[];
    displayMode: JuliaCellDisplayMode;
    type: 'julia-cell';
    version: 1;
}

export function $createJuliaCellNode(
    code = '',
    output = '',
    hasError = false,
    plots: JuliaCellPlot[] = [],
    displayMode: JuliaCellDisplayMode = 'both',
    autoEdit = false,
): JuliaCellNode {
    return $applyNodeReplacement(
        new JuliaCellNode(code, output, hasError, plots, displayMode, undefined, autoEdit),
    );
}

export function $isJuliaCellNode(node: LexicalNode | null | undefined): node is JuliaCellNode {
    return node instanceof JuliaCellNode;
}

/**
 * A Jupyter-style Julia code cell: editable source plus the captured output
 * (text, errors and plots) of its most recent run. The cell runs against the
 * app's shared Julia REPL kernel.
 */
export class JuliaCellNode extends DecoratorNode<DecoratorJuliaCellType> {
    __code: string;
    __output: string;
    __hasError: boolean;
    __plots: JuliaCellPlot[];
    __displayMode: JuliaCellDisplayMode;
    __autoEdit: boolean;

    constructor(
        code: string,
        output: string,
        hasError: boolean,
        plots: JuliaCellPlot[],
        displayMode: JuliaCellDisplayMode = 'both',
        key?: NodeKey,
        autoEdit = false,
    ) {
        super(key);
        this.__code = code;
        this.__output = output;
        this.__hasError = hasError;
        this.__plots = plots;
        this.__displayMode = displayMode;
        this.__autoEdit = autoEdit;
    }

    static getType(): string {
        return 'julia-cell';
    }

    static clone(node: JuliaCellNode): JuliaCellNode {
        return new JuliaCellNode(
            node.__code,
            node.__output,
            node.__hasError,
            node.__plots,
            node.__displayMode,
            node.__key,
            node.__autoEdit,
        );
    }

    static importJSON(serializedNode: SerializedJuliaCellNode): JuliaCellNode {
        return $createJuliaCellNode(
            serializedNode.code,
            serializedNode.output,
            serializedNode.hasError,
            serializedNode.plots ?? [],
            serializedNode.displayMode ?? 'both',
        );
    }

    exportJSON(): SerializedJuliaCellNode {
        return {
            code: this.__code,
            output: this.__output,
            hasError: this.__hasError,
            plots: this.__plots,
            displayMode: this.__displayMode,
            type: 'julia-cell',
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

    setResult(output: string, hasError: boolean, plots: JuliaCellPlot[]): void {
        const writable = this.getWritable();
        writable.__output = output;
        writable.__hasError = hasError;
        writable.__plots = plots;
    }

    setDisplayMode(mode: JuliaCellDisplayMode): void {
        this.getWritable().__displayMode = mode;
    }

    getDisplayMode(): JuliaCellDisplayMode {
        return this.__displayMode;
    }

    setAutoEdit(value: boolean): void {
        this.getWritable().__autoEdit = value;
    }

    decorate(): DecoratorJuliaCellType {
        return {
            componentClass: JuliaCellComponent,
            updateProps: (props) => {
                props.code = this.__code;
                props.output = this.__output;
                props.hasError = this.__hasError;
                props.plots = this.__plots;
                props.displayMode = this.__displayMode;
                props.nodeKey = this.__key;
                props.autoEdit = this.__autoEdit;
            },
        };
    }
}
