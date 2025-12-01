# Kueli - アーキテクチャ設計

## システム概要

```
┌─────────────────────────────────────────────────┐
│               Browser (Client)                  │
│  ┌──────────────────────────────────────────┐  │
│  │  Next.js App Router (React 19)            │  │
│  │  - Client Components (useSession)         │  │
│  │  - Markdown Editor (CodeMirror)          │  │
│  │  - UI Components (Radix + Tailwind)      │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
                      ↓ HTTP/HTTPS
┌─────────────────────────────────────────────────┐
│          Next.js Server (Container)             │
│  ┌──────────────────────────────────────────┐  │
│  │  Server Components & Server Actions       │  │
│  │  - getNotes(), saveNote(), deleteNote()   │  │
│  │  - NextAuth.js (JWT)                     │  │
│  │  - API Routes (/api/upload)              │  │
│  └──────────────────────────────────────────┘  │
│                     ↓                            │
│  ┌──────────────────────────────────────────┐  │
│  │  Prisma Client (ORM)                      │  │
│  └──────────────────────────────────────────┘  │
│                     ↓                            │
│  ┌──────────────────────────────────────────┐  │
│  │  SQLite Database                          │  │
│  │  - users, notes                           │  │
│  │  Location: ./data/prisma/dev.db          │  │
│  └──────────────────────────────────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────┐  │
│  │  File System                              │  │
│  │  - Uploaded Images                        │  │
│  │  Location: ./data/uploads/               │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## データフロー

### 認証フロー
```
1. User → POST /api/auth/signin (credentials)
2. NextAuth → Prisma → SQLite (verify password)
3. NextAuth → Generate JWT
4. Client → Store session (useSession hook)
```

### メモ取得フロー
```
1. Client Component → Server Action: getNotes()
2. Server Action → auth() (verify JWT)
3. Server Action → Prisma → SQLite
4. SQLite → Parse JSON (tags, images)
5. Return Note[] → Client Component
```

### 画像アップロードフロー
```
1. Client → POST /api/upload (FormData)
2. API Route → auth() (verify JWT)
3. API Route → writeFile() → ./data/uploads/
4. Return { filename, url }
5. Client → Update note.images via Server Action
```

## ディレクトリ設計

### Server vs Client Boundary

```
app/src/
├── actions/              # SERVER ONLY
│   └── note.ts          # 'use server' + auth check
├── app/
│   ├── api/             # SERVER ONLY (API Routes)
│   ├── layout.tsx       # SERVER (wraps with Providers)
│   ├── page.tsx         # CLIENT ('use client')
│   ├── login/page.tsx   # CLIENT
│   └── notes/[id]/      # CLIENT
├── components/
│   ├── Providers.tsx    # CLIENT ('use client' + SessionProvider)
│   ├── Sidebar.tsx      # CLIENT
│   └── ui/              # CLIENT (Radix components)
├── lib/
│   ├── prisma.ts        # SERVER ONLY
│   ├── auth.ts          # SERVER ONLY (getServerSession)
│   ├── types.ts         # SHARED
│   └── utils.ts         # SHARED
└── types/
    └── next-auth.d.ts   # SHARED (type declarations)
```

## データモデル

### Prisma Schema

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String   // bcrypt hash
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Note {
  id        String   @id @default(cuid())
  title     String
  content   String   @default("")
  tags      String   @default("[]")  // JSON array
  images    String   @default("[]")  // JSON array
  isPinned  Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt       // Auto-update
}
```

### TypeScript Types

```typescript
// lib/types.ts
export interface Note {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  tags: string[];      // Parsed from JSON
  images: string[];    // Parsed from JSON
  createdAt: Date;
  updatedAt: Date;
}
```

## セキュリティ設計

### 認証
- **Method**: Credentials Provider (NextAuth.js)
- **Session**: JWT (no database sessions)
- **Password**: bcrypt (10 rounds)

### 認可
- **Server Actions**: すべて `auth()` チェック
- **API Routes**: すべて `auth()` チェック
- **File Access**: `/uploads/*` は公開（要改善: トークンベース）

### CSRF対策
- NextAuth.js built-in CSRF protection

## パフォーマンス

### データベース
- **SQLite**: ファイルベース、シンプル
- **Indexing**: email (unique), updatedAt (ordering)
- **JSON Fields**: タグ・画像の配列をJSON文字列として保存

### キャッシング
- Next.js automatic caching (Server Components)
- `revalidatePath('/')` on mutations

### 画像最適化
- **Current**: 生ファイル配信
- **Future**: Next.js Image component + optimization

## スケーラビリティ制限

### 現在の制限
- Single container (no horizontal scaling)
- SQLite (single-writer)
- File-based uploads (no CDN)

### スケールアップパス
1. SQLite → PostgreSQL
2. File storage → S3/R2
3. Container → Multi-instance + Load Balancer
4. Session → Redis-backed

## 技術的負債

### 改善済み ✅
- [x] 画像のトークンベース認証 → `/api/images/*` で認証必須
- [x] Next.js Image component による最適化 → 全画像でImage component使用
- [x] Server Component でのデータ取得 → page.tsx を Server Component に変更
- [x] エラーハンドリングの統一 → `lib/errors.ts` で統一的な処理

### 今後の改善予定
- [ ] テストコード追加（Jest + React Testing Library）
- [ ] CI/CDパイプライン構築
- [ ] Storybook導入（UIコンポーネントのドキュメント化）
- [ ] パフォーマンスモニタリング（Sentry等）
- [ ] ダークモード対応の改善

## 開発ガイドライン

### コンポーネント作成ルール
1. デフォルトは Server Component
2. `useSession`, `useState` 等が必要な場合のみ `'use client'`
3. Server Actions で認証チェックを必ず実施

### ファイル命名規則
- Components: PascalCase.tsx
- Server Actions: camelCase.ts
- API Routes: route.ts (App Router)

### Git コミット規則
- `feat:` 新機能
- `fix:` バグ修正
- `refactor:` リファクタリング
- `docs:` ドキュメント
- `chore:` 雑務
