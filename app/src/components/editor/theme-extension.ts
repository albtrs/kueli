import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { EditorView } from "@codemirror/view";

// --- 1. シンタックスハイライト（文字色・太さ） ---
const markdownHighlighting = HighlightStyle.define([
  // 見出し: 太字のみ、色は通常
  { tag: t.heading, fontWeight: "bold" }, 
  
  // 太字: しっかり太く
  { tag: t.strong, fontWeight: "bold", color: "inherit" },
  
  // 斜体
  { tag: t.emphasis, fontStyle: "italic" },
  
  // リストのマーカー (- や 1.): 通常色
  { tag: t.list, color: "inherit" }, 
  
  // 引用 (>): 緑系
  { tag: t.quote, color: "#10b981", fontStyle: "italic" },
  
  // リンクのテキスト [text]: 通常色
  { tag: t.link, color: "inherit" },
  
  // リンクのURL (url): 薄めのグレー
  { tag: t.url, color: "#9ca3af" },
  
  // コードブロック (```)
  { tag: t.monospace, color: "#ef4444", backgroundColor: "#f3f4f6", borderRadius: "4px" },
]);

// --- 2. エディタの見た目調整 ---
const markdownStyles = EditorView.theme({
  "&": {
    fontFamily: "var(--font-mplus1code), monospace", // フォント設定
    fontSize: "15px",
    lineHeight: "1.7",
  },
  
  ".cm-content": { padding: "12px 16px" },
  
  // アクティブ行（背景色のみ）
  ".cm-activeLine": {
    backgroundColor: "rgba(59, 130, 246, 0.05)",
  },

  // 見出しサイズ調整 (そのまま維持)
  ".cm-header-1": { fontSize: "1.6em", borderBottom: "1px solid #e5e7eb", paddingBottom: "4px", marginBottom: "8px", display: "inline-block", width: "100%" },
  ".cm-header-2": { fontSize: "1.4em", marginTop: "10px" },
  ".cm-header-3": { fontSize: "1.2em" },

  // ★修正: リンクURLの視認性調整
  ".cm-url": {
    fontSize: "0.85em",
    opacity: "0.7", // 0.6だと薄すぎたので少し上げる
  },

  // 引用ブロック
  ".cm-quote": {
    borderLeft: "3px solid #10b981",
    paddingLeft: "8px",
    margin: "4px 0",
    display: "inline-block",
  },

  // 水平線
  ".cm-hr": {
    borderTop: "2px dashed #d1d5db",
    display: "inline-block",
    width: "100%",
    height: "0px",
    fontSize: "0px",
  },
});

// 外部から使うためのエクスポート
export const richMarkdownTheme = [
  syntaxHighlighting(markdownHighlighting),
  markdownStyles
];
