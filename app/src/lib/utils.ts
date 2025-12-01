import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Markdown本文から #tag 形式のタグを抽出
 * @param content - Markdown本文
 * @returns タグの配列（重複なし）
 */
export function extractTags(content: string): string[] {
  if (!content) return [];
  
  // #tag 形式を抽出（#の後に英数字、アンダースコア、ハイフン、日本語が続く）
  const tagRegex = /#([\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\-]+)/g;
  const matches = content.matchAll(tagRegex);
  
  const tags = new Set<string>();
  for (const match of matches) {
    tags.add(match[1]); // # を除いた部分
  }
  
  return Array.from(tags);
}

/**
 * クライアントサイドでのツリー構造変換用ヘルパー
 */
export interface TreeNode {
  id: string;
  title: string;
  is_folder: boolean;
  is_pinned: boolean;
  children: TreeNode[];
  parent: string;
}

/**
 * フラットなノート配列を階層構造に変換
 * @param notes - フラットなノート配列
 * @returns ルートノードの配列
 */
export function buildTree(notes: any[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const rootNodes: TreeNode[] = [];
  
  // まず全ノードをマップに登録
  notes.forEach(note => {
    nodeMap.set(note.id, {
      id: note.id,
      title: note.title,
      is_folder: note.is_folder,
      is_pinned: note.is_pinned,
      parent: note.parent || '',
      children: [],
    });
  });
  
  // 親子関係を構築
  notes.forEach(note => {
    const node = nodeMap.get(note.id);
    if (!node) return;
    
    if (!note.parent) {
      // 親がいない = ルートノード
      rootNodes.push(node);
    } else {
      // 親ノードに追加
      const parentNode = nodeMap.get(note.parent);
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        // 親が見つからない場合はルートとして扱う
        rootNodes.push(node);
      }
    }
  });
  
  return rootNodes;
}
