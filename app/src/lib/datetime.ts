/**
 * 日時関連のユーティリティ関数
 */

/**
 * 日時ベースのタイトルを生成
 * @returns YYYY-MM-DD HH:mm:ss 形式の文字列
 */
export function generateDateTimeTitle(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 日付をJST形式でフォーマット
 * @param date Date オブジェクトまたは日付文字列
 * @returns フォーマットされた日付文字列
 */
export function formatDateJST(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
