import type {
    DOMExportOutput,
    EditorConfig,
    LexicalEditor,
    LexicalNode,
    NodeKey,
    SerializedLexicalNode,
    Spread,
} from 'lexical';

import { $applyNodeReplacement, DecoratorNode } from 'lexical';
import type { ComponentProps } from 'svelte';
import DrawingComponent from './DrawingComponent.svelte';
import { emptyScene, parseScene, sceneToDataUrl, type Scene } from './drawingScene.js';

export interface DrawingPayload {
    scene: Scene;
    altText?: string;
    width?: number;
    height?: number;
    maxWidth?: number;
    key?: NodeKey;
}

export type SerializedDrawingNode = Spread<
    {
        scene: Scene;
        altText: string;
        width: number;
        height: number;
        maxWidth: number;
    },
    SerializedLexicalNode
>;

type DecoratorDrawingType = {
    componentClass: typeof DrawingComponent;
    updateProps: (props: ComponentProps<typeof DrawingComponent>) => void;
};

export class DrawingNode extends DecoratorNode<DecoratorDrawingType> {
    __scene: Scene;
    __altText: string;
    __width: number;
    __height: number;
    __maxWidth: number;

    static getType(): string {
        return 'drawing';
    }

    static clone(node: DrawingNode): DrawingNode {
        return new DrawingNode(
            node.__scene,
            node.__altText,
            node.__maxWidth,
            node.__width,
            node.__height,
            node.__key,
        );
    }

    static importJSON(serializedNode: SerializedDrawingNode): DrawingNode {
        const { scene, altText, width, height, maxWidth } = serializedNode;
        return $createDrawingNode({
            scene: parseScene(scene),
            altText,
            width,
            height,
            maxWidth,
        });
    }

    constructor(
        scene: Scene,
        altText: string,
        maxWidth: number,
        width?: number,
        height?: number,
        key?: NodeKey,
    ) {
        super(key);
        this.__scene = scene ?? emptyScene();
        this.__altText = altText ?? '';
        this.__maxWidth = maxWidth || 640;
        this.__width = width || this.__scene.width;
        this.__height = height || this.__scene.height;
    }

    exportJSON(): SerializedDrawingNode {
        return {
            scene: this.__scene,
            altText: this.__altText,
            width: this.__width,
            height: this.__height,
            maxWidth: this.__maxWidth,
            type: 'drawing',
            version: 1,
        };
    }

    // Degrade to a plain <img> with an inline SVG data-URL so copy/paste and
    // any HTML-export path still shows the drawing.
    exportDOM(): DOMExportOutput {
        const element = document.createElement('img');
        element.setAttribute('src', sceneToDataUrl(this.__scene));
        element.setAttribute('alt', this.__altText);
        element.setAttribute('width', this.__width.toString());
        element.setAttribute('height', this.__height.toString());
        element.setAttribute('data-lexical-drawing', 'true');
        return { element };
    }

    setScene(scene: Scene): void {
        const writable = this.getWritable();
        writable.__scene = scene;
    }

    setWidthAndHeight(width: number, height: number): void {
        const writable = this.getWritable();
        writable.__width = width;
        writable.__height = height;
    }

    getScene(): Scene {
        return this.__scene;
    }

    createDOM(config: EditorConfig): HTMLElement {
        const span = document.createElement('span');
        const theme = config.theme;
        const className = theme.image; // reuse the image wrapper styling
        if (className !== undefined) {
            span.className = className;
        }
        return span;
    }

    updateDOM(): false {
        return false;
    }

    decorate(editor: LexicalEditor): DecoratorDrawingType {
        return {
            componentClass: DrawingComponent,
            updateProps: (props) => {
                props.scene = this.__scene;
                props.altText = this.__altText;
                props.width = this.__width;
                props.height = this.__height;
                props.maxWidth = this.__maxWidth;
                props.nodeKey = this.__key;
                props.resizable = true;
                props.editor = editor;
            },
        };
    }
}

export function $createDrawingNode({
    scene,
    altText = '',
    maxWidth = 640,
    width,
    height,
    key,
}: DrawingPayload): DrawingNode {
    return $applyNodeReplacement(
        new DrawingNode(scene, altText, maxWidth, width, height, key),
    );
}

export function $isDrawingNode(
    node: LexicalNode | null | undefined,
): node is DrawingNode {
    return node instanceof DrawingNode;
}
