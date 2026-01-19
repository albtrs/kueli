/**
 * Googleライクな検索クエリパーサー
 * 
 * サポートする構文:
 * - `word1 word2`  : AND検索（両方を含む）
 * - `word1 | word2`: OR検索（どちらかを含む）
 * - `-word`        : NOT検索（含まない）
 * - `"phrase"`     : フレーズ検索（スペースを含む語句をそのまま検索）
 * 
 * 使用例:
 * ```typescript
 * import { parseSearchQuery, createNoteWhereInput } from '@/lib/search-parser';
 * 
 * // 汎用的なトークン解析
 * const parsed = parseSearchQuery('react -jquery | "next js"');
 * 
 * // Prisma Note用のWhereInput生成
 * const where = createNoteWhereInput('react typescript');
 * const notes = await prisma.note.findMany({ where });
 * ```
 */

// =============================================================================
// 型定義
// =============================================================================

/** 検索トークンの種類 */
export type TokenType = 'include' | 'exclude';

/** 解析済みトークン */
export interface SearchToken {
  type: TokenType;
  value: string;
  isPhrase: boolean; // ダブルクォートで囲まれていたか
}

/** ANDグループ（スペース区切りのトークン群） */
export interface AndGroup {
  includes: SearchToken[];  // 含むべきキーワード
  excludes: SearchToken[];  // 除外すべきキーワード
}

/** 解析結果（ORで結合された複数のANDグループ） */
export interface ParsedQuery {
  orGroups: AndGroup[];
  isEmpty: boolean;
}

/** Prisma WhereInput用の汎用型 */
export interface FieldCondition {
  contains?: string;
  equals?: string;
  startsWith?: string;
  endsWith?: string;
}

export interface WhereCondition {
  AND?: WhereCondition[];
  OR?: WhereCondition[];
  NOT?: WhereCondition[];
  [field: string]: FieldCondition | WhereCondition[] | undefined;
}

// =============================================================================
// トークン解析（汎用）
// =============================================================================

/**
 * 検索文字列をトークンに分解する
 * 
 * @param query - 検索クエリ文字列
 * @returns 解析結果
 * 
 * @example
 * parseSearchQuery('react -jquery | "next js" typescript')
 * // => {
 * //   orGroups: [
 * //     { includes: [{value: 'react', ...}], excludes: [{value: 'jquery', ...}] },
 * //     { includes: [{value: 'next js', isPhrase: true}, {value: 'typescript'}], excludes: [] }
 * //   ],
 * //   isEmpty: false
 * // }
 */
export function parseSearchQuery(query: string): ParsedQuery {
  const trimmed = query.trim();
  
  if (!trimmed) {
    return { orGroups: [], isEmpty: true };
  }

  // Step 1: パイプ(|)でOR分割
  // 注意: クォート内のパイプは分割しない
  const orSegments = splitByPipe(trimmed);
  
  // Step 2: 各セグメントをトークン化
  const orGroups: AndGroup[] = orSegments
    .map(segment => tokenizeSegment(segment))
    .filter(group => group.includes.length > 0 || group.excludes.length > 0);

  return {
    orGroups,
    isEmpty: orGroups.length === 0,
  };
}

/**
 * クォートを考慮してパイプで分割
 */
function splitByPipe(input: string): string[] {
  const segments: string[] = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (char === '"') {
      inQuote = !inQuote;
      current += char;
    } else if (char === '|' && !inQuote) {
      segments.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  return segments.filter(s => s.length > 0);
}

/**
 * セグメント内のトークンを抽出
 */
function tokenizeSegment(segment: string): AndGroup {
  const includes: SearchToken[] = [];
  const excludes: SearchToken[] = [];

  // 正規表現でトークンを抽出
  // 1. ダブルクォートで囲まれた文字列（前に-がある場合も考慮）
  // 2. -から始まる単語
  // 3. 通常の単語
  const tokenRegex = /(-?"[^"]*")|(-?\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(segment)) !== null) {
    const raw = match[0];
    const token = parseToken(raw);
    
    if (token.value) {
      if (token.type === 'exclude') {
        excludes.push(token);
      } else {
        includes.push(token);
      }
    }
  }

  return { includes, excludes };
}

/**
 * 生のトークン文字列を解析
 */
function parseToken(raw: string): SearchToken {
  let value = raw;
  let type: TokenType = 'include';
  let isPhrase = false;

  // 先頭の - をチェック（除外）
  if (value.startsWith('-')) {
    type = 'exclude';
    value = value.slice(1);
  }

  // ダブルクォートを除去
  if (value.startsWith('"') && value.endsWith('"')) {
    isPhrase = true;
    value = value.slice(1, -1);
  }

  return {
    type,
    value: value.trim(),
    isPhrase,
  };
}

// =============================================================================
// Prisma WhereInput 生成（汎用）
// =============================================================================

/**
 * 解析結果を汎用的なWhereInputに変換
 * 
 * @param parsed - parseSearchQueryの結果
 * @param fields - 検索対象のフィールド名配列
 * @param options - オプション設定
 * @returns Prisma互換のWhereInputオブジェクト
 */
export function createWhereInput(
  parsed: ParsedQuery,
  fields: string[],
  options: {
    /** JSON文字列フィールドの場合、値をクォートで囲む */
    jsonFields?: string[];
  } = {}
): WhereCondition {
  if (parsed.isEmpty) {
    return {};
  }

  const { jsonFields = [] } = options;

  // 単一のANDグループの場合
  if (parsed.orGroups.length === 1) {
    return buildAndGroupCondition(parsed.orGroups[0], fields, jsonFields);
  }

  // 複数のORグループの場合
  const orConditions = parsed.orGroups
    .map(group => buildAndGroupCondition(group, fields, jsonFields))
    .filter(cond => Object.keys(cond).length > 0);

  if (orConditions.length === 0) {
    return {};
  }

  if (orConditions.length === 1) {
    return orConditions[0];
  }

  return { OR: orConditions };
}

/**
 * ANDグループを条件オブジェクトに変換
 */
function buildAndGroupCondition(
  group: AndGroup,
  fields: string[],
  jsonFields: string[]
): WhereCondition {
  const conditions: WhereCondition[] = [];

  // 含むべきキーワード（AND条件）
  for (const token of group.includes) {
    const fieldConditions = fields.map(field => {
      const searchValue = jsonFields.includes(field) 
        ? `"${token.value}"` 
        : token.value;
      return { [field]: { contains: searchValue } };
    });

    // 複数フィールドのいずれかにマッチ
    if (fieldConditions.length === 1) {
      conditions.push(fieldConditions[0]);
    } else {
      conditions.push({ OR: fieldConditions });
    }
  }

  // 除外キーワード（NOT条件）
  for (const token of group.excludes) {
    const fieldConditions = fields.map(field => {
      const searchValue = jsonFields.includes(field)
        ? `"${token.value}"`
        : token.value;
      return { [field]: { contains: searchValue } };
    });

    // 複数フィールドのどれにも含まれない
    if (fieldConditions.length === 1) {
      conditions.push({ NOT: [fieldConditions[0]] });
    } else {
      // 全フィールドに含まれないことを確認
      conditions.push({ NOT: fieldConditions });
    }
  }

  // 条件を結合
  if (conditions.length === 0) {
    return {};
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return { AND: conditions };
}

// =============================================================================
// Note専用のヘルパー関数
// =============================================================================

import type { Prisma } from '@prisma/client';

/** Note検索のデフォルトフィールド */
const NOTE_SEARCH_FIELDS = ['title', 'content', 'tags'] as const;

/** Note検索のJSONフィールド */
const NOTE_JSON_FIELDS = ['tags'] as const;

/**
 * LinkMetadata検索用の条件を生成
 */
function buildLinkMetadataCondition(parsed: ParsedQuery): Prisma.LinkMetadataWhereInput | null {
  if (parsed.isEmpty || parsed.orGroups.length === 0) {
    return null;
  }

  // 単一のANDグループの場合
  if (parsed.orGroups.length === 1) {
    const group = parsed.orGroups[0];
    const conditions: Prisma.LinkMetadataWhereInput[] = [];

    // includeキーワード: searchTextにすべて含む
    for (const token of group.includes) {
      conditions.push({ searchText: { contains: token.value } });
    }

    // excludeキーワード: searchTextに含まない
    for (const token of group.excludes) {
      conditions.push({ NOT: { searchText: { contains: token.value } } });
    }

    if (conditions.length === 0) return null;
    if (conditions.length === 1) return conditions[0];
    return { AND: conditions };
  }

  // 複数のORグループの場合
  const orConditions: Prisma.LinkMetadataWhereInput[] = [];
  for (const group of parsed.orGroups) {
    const andConditions: Prisma.LinkMetadataWhereInput[] = [];

    for (const token of group.includes) {
      andConditions.push({ searchText: { contains: token.value } });
    }
    for (const token of group.excludes) {
      andConditions.push({ NOT: { searchText: { contains: token.value } } });
    }

    if (andConditions.length === 1) {
      orConditions.push(andConditions[0]);
    } else if (andConditions.length > 1) {
      orConditions.push({ AND: andConditions });
    }
  }

  if (orConditions.length === 0) return null;
  if (orConditions.length === 1) return orConditions[0];
  return { OR: orConditions };
}

/**
 * Note検索用のWhereInputを生成
 *
 * @param query - 検索クエリ文字列
 * @param baseWhere - 追加の基本条件（isArchived, isPinnedなど）
 * @returns Prisma.NoteWhereInput
 *
 * @example
 * // 基本的な使い方
 * const where = createNoteWhereInput('react typescript');
 * const notes = await prisma.note.findMany({ where });
 *
 * // アーカイブ除外 + 検索
 * const where = createNoteWhereInput('react', { isArchived: false });
 *
 * // 複雑な検索
 * const where = createNoteWhereInput('react -jquery | "next js"');
 */
export function createNoteWhereInput(
  query: string,
  baseWhere: Prisma.NoteWhereInput = {}
): Prisma.NoteWhereInput {
  const parsed = parseSearchQuery(query);

  if (parsed.isEmpty) {
    return baseWhere;
  }

  // Note自体のフィールド検索条件
  const noteFieldCondition = createWhereInput(
    parsed,
    [...NOTE_SEARCH_FIELDS],
    { jsonFields: [...NOTE_JSON_FIELDS] }
  );

  // LinkMetadata経由の検索条件
  const linkMetadataCondition = buildLinkMetadataCondition(parsed);

  // 統合: Note自体 OR 関連LinkMetadataにマッチ
  let searchCondition: Prisma.NoteWhereInput;
  if (linkMetadataCondition) {
    searchCondition = {
      OR: [
        noteFieldCondition as Prisma.NoteWhereInput,
        {
          links: {
            some: {
              linkMetadata: linkMetadataCondition,
            },
          },
        },
      ],
    };
  } else {
    searchCondition = noteFieldCondition as Prisma.NoteWhereInput;
  }

  // baseWhereと検索条件をマージ
  if (Object.keys(baseWhere).length === 0) {
    return searchCondition;
  }

  return {
    ...baseWhere,
    AND: [searchCondition],
  };
}

// =============================================================================
// デバッグ・ユーティリティ
// =============================================================================

/**
 * 解析結果を人間が読める形式で出力（デバッグ用）
 */
export function debugParsedQuery(parsed: ParsedQuery): string {
  if (parsed.isEmpty) {
    return '(empty query)';
  }

  const groupStrings = parsed.orGroups.map((group, i) => {
    const parts: string[] = [];
    
    if (group.includes.length > 0) {
      const includes = group.includes
        .map(t => t.isPhrase ? `"${t.value}"` : t.value)
        .join(' AND ');
      parts.push(`INCLUDE(${includes})`);
    }
    
    if (group.excludes.length > 0) {
      const excludes = group.excludes
        .map(t => t.isPhrase ? `"${t.value}"` : t.value)
        .join(', ');
      parts.push(`EXCLUDE(${excludes})`);
    }

    return `Group${i + 1}: ${parts.join(' + ')}`;
  });

  return groupStrings.join(' OR ');
}
