import { ParagraphNode } from 'lexical';
import type { EditorConfig, SerializedParagraphNode } from 'lexical';

// ParagraphNode's serialized shape doesn't include the element-level `style`
// (only `textStyle`), so we persist it ourselves to round-trip block styles
// such as line spacing.
type SerializedExtendedParagraphNode = SerializedParagraphNode & { style?: string };

export class ExtendedParagraphNode extends ParagraphNode {
  // Must be a unique type, distinct from the core ParagraphNode it replaces:
  // Lexical validates that a node's constructor matches the class registered
  // for its type, so a replacement subclass cannot reuse 'paragraph'.
  // Serializes/round-trips as 'extended-paragraph' (DOCX/Typst exporters and
  // the block-format toolbar treat it as a normal paragraph).
  static getType(): string {
    return 'extended-paragraph';
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

  static importJSON(serializedNode: SerializedExtendedParagraphNode): ExtendedParagraphNode {
    const node = new ExtendedParagraphNode();
    node.updateFromJSON(serializedNode);
    return node;
  }

  updateFromJSON(serializedNode: SerializedExtendedParagraphNode): this {
    super.updateFromJSON(serializedNode);
    if (serializedNode.style) this.setStyle(serializedNode.style);
    return this;
  }

  exportJSON(): SerializedExtendedParagraphNode {
    const json: SerializedExtendedParagraphNode = super.exportJSON();
    const style = this.__style;
    if (style) json.style = style;
    return json;
  }
}
