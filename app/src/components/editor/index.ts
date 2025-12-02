// エディタ関連のエクスポート
export { richMarkdownTheme } from './theme-extension';
export { customHighlighters } from './extensions';
export { createWikiLinkCompletion } from './autocomplete';

/**
 * Markdownエクステンションを取得
 */
export const getMarkdownExtension = async () => {
  const { markdown } = await import('@codemirror/lang-markdown');
  const { languages } = await import('@codemirror/language-data');
  return markdown({ codeLanguages: languages });
};

/**
 * 行移動用キーマップを取得
 */
export const getLineMovementKeymap = async () => {
  const { keymap } = await import('@codemirror/view');
  const { moveLineUp, moveLineDown } = await import('@codemirror/commands');
  
  return keymap.of([
    { key: "Ctrl-ArrowUp", run: moveLineUp, preventDefault: true },
    { key: "Ctrl-ArrowDown", run: moveLineDown, preventDefault: true },
    { key: "Alt-ArrowUp", run: moveLineUp, preventDefault: true },
    { key: "Alt-ArrowDown", run: moveLineDown, preventDefault: true },
  ]);
};
