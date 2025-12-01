// Markdownテーブル関連のユーティリティ関数

/**
 * テーブルテンプレートを生成
 * @param rows 行数（ヘッダー除く）
 * @param cols 列数
 */
export const createTableTemplate = (rows: number = 3, cols: number = 3): string => {
  const header = `| ${Array(cols).fill("ヘッダー").map((h, i) => `${h}${i + 1}`).join(" | ")} |`;
  const separator = `| ${Array(cols).fill("---").join(" | ")} |`;
  const row = `| ${Array(cols).fill("").join(" | ")} |`;
  
  // ヘッダー + 区切り線 + (行数 x ボディ)
  return [header, separator, ...Array(rows).fill(row)].join("\n");
};

/**
 * TSV (Excel/Googleスプレッドシートからのコピー) を Markdownテーブルに変換
 * @param text ペーストされたテキスト
 */
export const convertTsvToMd = (text: string): string | null => {
  // タブがない場合はTSVではない（単なる複数行テキストを除外）
  if (!text.includes("\t")) return null;
  
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return null;

  // 各行をセルに分割
  const rows = lines.map(line => line.split("\t"));
  const colCount = Math.max(...rows.map(r => r.length));

  // 1列しかない場合はテーブルとして扱わない
  if (colCount < 2) return null;

  // 列数が一定でない場合は埋める
  const normalizedRows = rows.map(row => {
    const padded = [...row, ...Array(colCount - row.length).fill("")];
    return padded.map(cell => cell.trim());
  });

  // Markdown形式に組み立て
  const buildRow = (cells: string[]) => `| ${cells.join(" | ")} |`;

  const header = buildRow(normalizedRows[0]);
  const separator = `| ${Array(colCount).fill("---").join(" | ")} |`;
  const body = normalizedRows.slice(1).map(buildRow).join("\n");

  return `${header}\n${separator}${body ? "\n" + body : ""}`;
};

/**
 * 文字列の表示幅を計算（全角文字を考慮）
 * 全角文字は2、半角文字は1としてカウント
 */
const getDisplayWidth = (str: string): number => {
  return Array.from(str).reduce((width, char) => {
    const code = char.charCodeAt(0);
    // 全角文字の判定（簡易版）
    if ((code >= 0x3000 && code <= 0x9FFF) || // CJK symbols and CJK unified ideographs
        (code >= 0xFF00 && code <= 0xFFEF) || // Fullwidth ASCII variants
        (code >= 0x4E00 && code <= 0x9FFF)) { // CJK unified ideographs
      return width + 2;
    }
    return width + 1;
  }, 0);
};

/**
 * 指定した表示幅になるようにスペースでパディング
 */
const padToWidth = (str: string, targetWidth: number): string => {
  const currentWidth = getDisplayWidth(str);
  const padding = Math.max(0, targetWidth - currentWidth);
  return str + " ".repeat(padding);
};

/**
 * Markdownテーブルを整形（列幅を揃える）
 * @param text Markdownテーブルのテキスト
 */
export const formatMarkdownTable = (text: string): string => {
  const lines = text.trim().split("\n");
  const rows = lines.map(line => 
    line.replace(/^\||\|$/g, "").split("|").map(cell => cell.trim())
  );
  
  if (rows.length < 2) return text; // テーブルじゃなさそう

  const colCount = rows[0].length;
  const colWidths: number[] = Array(colCount).fill(0);

  // 各列の最大幅を計算（セパレーター行は除外）
  rows.forEach((row, rowIndex) => {
    // セパレーター行（2行目）はスキップ
    const isSeparator = rowIndex === 1 && row.every(c => c.match(/^-+$/));
    if (isSeparator) return;
    
    row.forEach((cell, i) => {
      const width = getDisplayWidth(cell);
      if (width > colWidths[i]) colWidths[i] = width;
    });
  });

  // 最小幅を3に設定（---の最小長）
  colWidths.forEach((width, i) => {
    colWidths[i] = Math.max(width, 3);
  });

  // 整形して結合
  return rows.map((row, rowIndex) => {
    const isSeparator = rowIndex === 1 && row.every(c => c.match(/^-+$/));
    
    return "| " + row.map((cell, i) => {
      const width = colWidths[i];
      if (isSeparator) {
        return "-".repeat(width);
      }
      return padToWidth(cell, width);
    }).join(" | ") + " |";
  }).join("\n");
};

/**
 * カーソル位置の行がテーブル内かどうかを判定し、テーブル全体の範囲を返す
 * @param text ドキュメント全体のテキスト
 * @param cursorPos カーソル位置
 */
export const findTableRange = (text: string, cursorPos: number): { from: number; to: number; text: string } | null => {
  const lines = text.split("\n");
  let charCount = 0;
  let currentLine = 0;
  
  // カーソルがある行を特定
  for (let i = 0; i < lines.length; i++) {
    charCount += lines[i].length + 1; // +1 for newline
    if (charCount > cursorPos) {
      currentLine = i;
      break;
    }
  }
  
  // カーソル行がテーブル行（| で始まる）かチェック
  if (!lines[currentLine]?.trim().startsWith("|")) {
    return null;
  }
  
  // テーブルの開始行を探す
  let startLine = currentLine;
  while (startLine > 0 && lines[startLine - 1]?.trim().startsWith("|")) {
    startLine--;
  }
  
  // テーブルの終了行を探す
  let endLine = currentLine;
  while (endLine < lines.length - 1 && lines[endLine + 1]?.trim().startsWith("|")) {
    endLine++;
  }
  
  // 開始位置を計算
  let from = 0;
  for (let i = 0; i < startLine; i++) {
    from += lines[i].length + 1;
  }
  
  // 終了位置を計算
  let to = from;
  for (let i = startLine; i <= endLine; i++) {
    to += lines[i].length + (i < lines.length - 1 ? 1 : 0);
  }
  
  const tableText = lines.slice(startLine, endLine + 1).join("\n");
  
  return { from, to, text: tableText };
};
