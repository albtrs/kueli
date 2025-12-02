import {
  Decoration,
  DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";

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
  // ★ [[WikiLink]] のデザイン
  ".cm-wikilink": {
    color: "#9333ea", // 紫色
    fontWeight: "bold",
    borderBottom: "1px solid #9333ea", // アンダーライン
    cursor: "pointer",
  }
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

// まとめてエクスポート
export const customHighlighters = [
  customHighlightTheme,
  hashtagPlugin,
  wikiLinkPlugin
];
