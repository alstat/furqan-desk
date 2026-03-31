import { ParagraphNode } from 'lexical';
import type { EditorConfig, SerializedParagraphNode } from 'lexical';

export class ExtendedParagraphNode extends ParagraphNode {
  static getType(): string {
    return 'paragraph';
  }

  static clone(node: ExtendedParagraphNode): ExtendedParagraphNode {
    return new ExtendedParagraphNode(node.__key);
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config) as HTMLElement;
    // __style is the raw property; safe to read directly (same pattern as ListItemNode)
    const style = this.__style;
    if (style) dom.style.cssText = style;
    return dom;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    const shouldRecreate = super.updateDOM(prevNode, dom, config);
    if (!shouldRecreate) {
      // Access __style directly (not via getStyle()) to avoid getLatest()
      // resolving prevNode to the next node in the pending editor state.
      const prevStyle = prevNode.__style ?? '';
      const nextStyle = this.__style ?? '';
      if (prevStyle !== nextStyle) {
        if (nextStyle === '') {
          dom.removeAttribute('style');
        } else {
          dom.style.cssText = nextStyle;
        }
      }
    }
    return shouldRecreate;
  }

  static importJSON(serializedNode: SerializedParagraphNode): ExtendedParagraphNode {
    const node = new ExtendedParagraphNode();
    node.updateFromJSON(serializedNode);
    return node;
  }
}
