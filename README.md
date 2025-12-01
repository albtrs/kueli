# Kueli - Personal Note-Taking App

シンプルで高速な個人用Markdownメモアプリ

## 🎯 特徴

- **Markdown編集**: CodeMirrorによる快適な編集体験
- **タグ管理**: ハッシュタグで自動分類
- **画像アップロード**: ドラッグ&ドロップ対応
- **セキュア認証**: NextAuth.js + JWT
- **完全永続化**: SQLite + ファイルストレージ
- **Docker完結**: ホスト環境を汚さない開発環境

## 🛠 技術スタック

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Editor | CodeMirror 6, ReactMarkdown |
| Styling | Tailwind CSS 4, Radix UI |
| Backend | Next.js Server Actions, Prisma ORM |
| Database | SQLite |
| Auth | NextAuth.js (Credentials) |
| Runtime | Node.js 22, Docker |

## 🚀 クイックスタート

```bash
cd c:/home/dev/kueli

# サービス起動（初回は自動でDB作成）
docker compose up -d

# 初期データ投入
docker exec -it kueli-app sh -c "npx tsx prisma/seed.ts"

# ブラウザでアクセス
# http://localhost:3001
# user@example.com / password123456
```

詳細は [docs/SETUP.md](./docs/SETUP.md) を参照

## 📂 プロジェクト構造

```
kueli/
├── app/                    # Next.jsアプリケーション
│   ├── prisma/            # Prismaスキーマ・シード
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── actions/       # Server Actions
│   │   ├── app/           # App Router
│   │   │   ├── api/       # API Routes
│   │   │   ├── login/
│   │   │   ├── notes/[id]/
│   │   │   └── page.tsx   # Dashboard
│   │   ├── components/    # React Components
│   │   ├── lib/           # Utilities
│   │   └── types/         # Type definitions
│   └── public/uploads/    # → data/uploads (mounted)
├── data/                  # 永続化データ
│   ├── prisma/           # SQLite DB
│   └── uploads/          # ユーザー画像
├── docs/                 # ドキュメント
├── docker-compose.yml
└── README.md
```

## 🔧 開発コマンド

```bash
# ログ確認
docker logs kueli-app -f

# コンテナ再起動
docker compose restart

# 停止
docker compose down

# データ完全削除
docker compose down && rm -rf data/prisma/* data/uploads/*

# Prisma Studio（DB GUI）
docker exec -it kueli-app npx prisma studio
```

## 💾 データ永続化

すべてのデータは `./data/` に保存されます:

```
data/
├── prisma/dev.db    # SQLite データベース
└── uploads/         # アップロード画像
```

**バックアップ**:
```bash
tar -czf backup-$(date +%Y%m%d).tar.gz data/
```

## 📝 ライセンス

MIT
