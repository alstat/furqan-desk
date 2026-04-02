import { $applyNodeReplacement, DecoratorNode, type EditorConfig, type LexicalNode, type NodeKey, type SerializedLexicalNode } from 'lexical';
import CodeComponent from './CodeComponent.svelte';
import type { ComponentProps } from 'svelte';

type DecoratorCodeType = {
    componentClass: typeof CodeComponent;
    updateProps?: (props: ComponentProps<typeof CodeComponent>) => void;
}

export interface SerializedCodeNode extends SerializedLexicalNode {
    code: string;
    language: string;
    type: 'code';
    version: 1;
}

export function $createCodeNode(code: string, language: string): CodeNode {
    return $applyNodeReplacement(new CodeNode(code, language));
}

export function $isCodeNode(node: LexicalNode | null | undefined): node is CodeNode {
    return node instanceof CodeNode;
}

export class CodeNode extends DecoratorNode<DecoratorCodeType> {
    __code: string | null | undefined;
    __language: string | null | undefined;

    constructor(code: string | null | undefined, language: string | null | undefined, key?: NodeKey) {
        super(key);
        this.__code = code;
        this.__language = language;
    }

    static getType(): string {
        return 'code';
    }

    static clone(node: CodeNode): CodeNode {
        return new CodeNode(node.__code, node.__language, node.__key);
    }

    static importJSON(serializedNode: SerializedCodeNode): CodeNode {
        return $createCodeNode(serializedNode.code, serializedNode.language);
    }

    exportJSON(): SerializedCodeNode {
        return {
            code: this.__code!,
            language: this.__language!,
            type: 'code',
            version: 1,
        };
    }

    createDOM(_config: EditorConfig): HTMLElement {
        return document.createElement('div');
    }

    updateDOM(): boolean {
        return false;
    }

    isInline(): false {
        return false;
    }

    setCode(code: string): void {
        const writable = this.getWritable();
        writable.__code = code;
    }

    getCode(): string {
        return this.__code!;
    }

    setLanguage(language: string): void {
        const writable = this.getWritable();
        writable.__language = language;
    }

    getLanguage(): string {
        return this.__language!;
    }

    decorate(): DecoratorCodeType {
        return {
            componentClass: CodeComponent,
            updateProps: (props) => {
                props.code = this.__code!;
                props.language = this.__language!;
                props.nodeKey = this.__key;
            }
        };
    }
}
