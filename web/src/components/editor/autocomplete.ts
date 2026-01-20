/**
 * Wikiリンク用オートコンプリート
 */
export const createWikiLinkCompletion = async (noteTitles: string[]) => {
  const { autocompletion } = await import('@codemirror/autocomplete');
  
  return autocompletion({
    activateOnTyping: true,
    override: [
      (context: any) => {
        const line = context.state.doc.lineAt(context.pos);
        const textBefore = line.text.slice(0, context.pos - line.from);
        const textAfter = line.text.slice(context.pos - line.from);
        
        const match = textBefore.match(/\[\[([^\]]*)$/);
        if (!match) return null;
        
        const query = match[1].toLowerCase();
        const from = context.pos - match[1].length;
        const hasClosingBrackets = textAfter.startsWith(']]');
        
        const options = noteTitles
          .filter(t => t.toLowerCase().includes(query))
          .map(title => ({
            label: title,
            apply: (view: any, completion: any, from: number, to: number) => {
              void completion;
              const insertText = title + ']]';
              const deleteTo = hasClosingBrackets ? to + 2 : to;
              view.dispatch({
                changes: { from, to: deleteTo, insert: insertText },
                selection: { anchor: from + insertText.length },
              });
            },
          }));
        
        if (options.length === 0) return null;
        
        return {
          from,
          options,
        };
      },
    ],
  });
};
