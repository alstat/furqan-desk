import katex from "katex";
import { DecoratorNode, type NodeKey, type LexicalNode, type EditorConfig, type SerializedLexicalNode, $applyNodeReplacement } from "lexical";
import EquationComponent from "./EquationComponent.svelte";
import type { ComponentProps } from "svelte";

type DecoratorEquationType = {
    componentClass: typeof EquationComponent;
    updateProps?: (props: ComponentProps<typeof EquationComponent>) => void;
}

export interface SerializedEquationNode extends SerializedLexicalNode {
    equation: string;
    type: 'equation';
    version: 1;
    inline: boolean;
}

export function $createEquationNode(equation: string, inline: boolean, autoEdit = false): EquationNode {
    return $applyNodeReplacement(new EquationNode(equation, inline, undefined, autoEdit));
}

export function $isEquationNode(node: LexicalNode | null | undefined): node is EquationNode {
    return node instanceof EquationNode;
}

export class EquationNode extends DecoratorNode<DecoratorEquationType> {
    __equation: string;
    __inline: boolean;
    __autoEdit: boolean;

    constructor(equation: string, inline: boolean, key?: NodeKey, autoEdit = false) {
        super(key);
        this.__equation = equation;
        this.__inline = inline;
        this.__autoEdit = autoEdit;
    }

    static getType(): string {
        return 'equation';
    }

    static clone(node: EquationNode): EquationNode {
        // this method is used for copy/paste functionality
        return new EquationNode(node.__equation, node.__inline, node.__key)
    }

    static importJSON(serializedNode: SerializedEquationNode): EquationNode {
        // used to reconstruct an EquationNode from its serialized form. 
        return $createEquationNode(serializedNode.equation, serializedNode.inline);
    }

    exportJSON(): SerializedEquationNode {
        return {
            equation: this.__equation,
            type: 'equation',
            version: 1,
            inline: this.__inline
        }
    }

    createDOM(config: EditorConfig): HTMLElement {
        const dom = document.createElement(this.__inline ? 'span' : 'div');
        dom.className = this.__inline 
            ? (config.theme.inlineEquation || 'SL_Theme__equation_inline')
            : (config.theme.equation || 'SL_Theme__equation_display');
        return dom;
    }

    updateDOM(prevNode: EquationNode, dom: HTMLElement, config: EditorConfig): boolean {
        // Check both equation content and display mode changes
        if (prevNode.__equation !== this.__equation || prevNode.__inline !== this.__inline) {
            dom.className = this.__inline 
                ? (config.theme.inlineEquation || 'SL_Theme__equation_inline')
                : (config.theme.equation || 'SL_Theme__equation_display');
            return true;
        }
        return false;
    }

    setAutoEdit(value: boolean): void {
        const writable = this.getWritable();
        writable.__autoEdit = value;
    }

    setEquation(equation: string): void {
        const writable = this.getWritable();
        writable.__equation = equation;
    }

    getEquation(): string {
        return this.__equation;
    }

    setInline(inline: boolean): void {
        const writable = this.getWritable();
        writable.__inline = inline;
    }

    isInline(): boolean {
        return this.__inline;
    }

    // This is the key method that provides the props to the Svelte component
    decorate(): DecoratorEquationType {
        return {
            componentClass: EquationComponent,
            updateProps: (props) => {
                props.equation = this.__equation;
                props.isInline = this.__inline;
                props.nodeKey = this.__key;
                props.autoEdit = this.__autoEdit;
            }
        }
    }
}