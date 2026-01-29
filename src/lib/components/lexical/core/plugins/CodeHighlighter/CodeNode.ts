import hljs from 'highlight.js';
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
    __preDOM: HTMLElement | null | undefined;

    constructor(code: string | null | undefined, language:string | null | undefined, key?: NodeKey)  {
        super(key);
        this.__code = code;
        this.__language = language;
    }

    static getType(): string {
        return 'code';
    }

    static clone(node: CodeNode): CodeNode {
        return new CodeNode(node.__code, node.__language, node.__key)
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
        }
    }

    createDOM(config: EditorConfig): HTMLElement {
        this.__preDOM = document.createElement('pre');
        const codeDOM = document.createElement('code');
        codeDOM.innerHTML = this.__code!;
        this.__preDOM.classList.add('language-' + this.__language!);
        console.log('here is the language')
        console.log('language-' + this.__language!)
        this.__preDOM.appendChild(codeDOM);
        return this.__preDOM;
    }

    setCode(code: string): void {
        const writable = this.getWritable();
        writable.__code = code;
    }

    getCode(): string {
        return this.__code!;
    }

    decorate(): DecoratorCodeType {
        return {
            componentClass: CodeComponent,
            updateProps: (props) => {
                props.codeDOM = this.__preDOM!;
            }
        }
    }

}