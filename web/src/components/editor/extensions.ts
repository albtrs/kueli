import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";

// スタイルの定義
const customHighlightTheme = EditorView.baseTheme({
  // ★ #tag のデザイン (Notionのタグ風)
  ".cm-hashtag": {
    backgroundColor: "rgba(59, 130, 246, 0.15)", // 薄い青背景
    color: "#1d4ed8", // 濃い青文字
    borderRadius: "4px",
    padding: "2px 6px",
    margin: "0 2px",
    fontWeight: "600", // 太字
    fontSize: "0.9em",
    border: "1px solid rgba(59, 130, 246, 0.3)",
  },
  // ★ [[WikiLink]] のデザイン（青色に統一、通常カーソル）
  ".cm-wikilink": {
    color: "#2563eb", // 青色（リンクと統一）
    textDecoration: "underline",
    cursor: "text", // エディタなので通常カーソル
  },
  // ★ 通常リンク (http://, https://) のデザイン
  ".cm-link": {
    color: "#2563eb",
    textDecoration: "underline",
  },
});

// タグのマッチャー
const hashtagMatcher = new MatchDecorator({
  regexp: /#[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+/g,
  decoration: () => Decoration.mark({ class: "cm-hashtag" }),
});

// Wikiリンクのマッチャー
const wikiLinkMatcher = new MatchDecorator({
  regexp: /\[\[[^\]]+\]\]/g,
  decoration: () => Decoration.mark({ class: "cm-wikilink" }),
});

// 通常リンク(http/https)のマッチャー - Markdown記法の外にある裸のURLのみ
const urlMatcher = new MatchDecorator({
  regexp: /(?<!\]\()https?:\/\/[^\s<>"'\)\]]+/g,
  decoration: () => Decoration.mark({ class: "cm-link" }),
});

// プラグイン化
export const hashtagPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = hashtagMatcher.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = hashtagMatcher.updateDeco(update, this.decorations);
    }
  },
  { decorations: (v) => v.decorations }
);

export const wikiLinkPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = wikiLinkMatcher.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = wikiLinkMatcher.updateDeco(update, this.decorations);
    }
  },
  { decorations: (v) => v.decorations }
);

export const urlPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = urlMatcher.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = urlMatcher.updateDeco(update, this.decorations);
    }
  },
  { decorations: (v) => v.decorations }
);

// まとめてエクスポート
export const customHighlighters = [
  customHighlightTheme,
  hashtagPlugin,
  wikiLinkPlugin,
  urlPlugin,
];
