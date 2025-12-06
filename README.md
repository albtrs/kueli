# Kueli - Personal Note-Taking App

シンプルで高速な個人用Markdownメモアプリ

## 🎯 特徴

- **Markdown編集**: CodeMirrorによる快適な編集体験
- **タグ管理**: ハッシュタグで自動分類
- **画像アップロード**: ドラッグ&ドロップ対応
- **セキュア認証**: iron-session によるセッション管理
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
| Auth | iron-session |
| Runtime | Node.js 22, Docker |

## 🚀 本番デプロイ

### 1. クローンして環境変数を設定

```bash
git clone https://github.com/albtrs/kueli.git
cd kueli

# .env作成（SESSION_SECRETは32文字以上）
cat > .env << 'EOF'
SESSION_SECRET="your-secret-key-at-least-32-characters-long"
EOF
```

### 2. 起動

```bash
docker compose -f docker-compose.production.yml up -d --build
```

### 3. 初回セットアップ（DBマイグレーション＆管理者作成）

```bash
docker exec -it kueli npx prisma migrate deploy
docker exec -it kueli node scripts/user-manage.js create admin yourpassword --admin
```

http://localhost:3000 にアクセス（nginxでリバプロ推奨）

### 管理

```bash
# ログ
docker logs kueli -f

# 再起動
docker compose -f docker-compose.production.yml restart

# 停止
docker compose -f docker-compose.production.yml down
```

### アップデート

```bash
# バックアップ
tar -czf backup-$(date +%Y%m%d).tar.gz data/

# 更新
git pull
docker compose -f docker-compose.production.yml up -d --build
docker exec -it kueli npx prisma migrate deploy  # スキーマ変更時のみ
```

## 🛠 開発環境

```bash
# 開発用docker-composeを起動
docker compose up -d

# コンテナに入る
docker exec -it kueli-app sh

# 初回セットアップ（コンテナ内で実行）
npm install
npx prisma generate
npx prisma db push
npm run user:reset admin yourpassword
npm run dev

# ブラウザでアクセス
# http://localhost:3001
```

## 👤 ユーザー管理

```bash
# コンテナ内で実行

# ユーザー一覧
npm run user:list

# ユーザー作成
npm run user:create <username> <password>
npm run user:create <username> <password> -- --admin  # 管理者として

# パスワード変更
npm run user:password <username> <new-password>

# ユーザー削除
npm run user:delete <username>

# 全ユーザーリセット（管理者1人だけにする）
npm run user:reset                        # デフォルト: admin / password123456
npm run user:reset <username> <password>  # カスタム指定
```

## 📂 プロジェクト構造

```
kueli/
├── app/                    # Next.jsアプリケーション
│   ├── prisma/            # Prismaスキーマ
│   │   └── schema.prisma
│   ├── scripts/           # ユーティリティスクリプト
│   │   └── user-manage.ts # ユーザー管理CLI
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
├── data/                  # 永続化データ（Git管理外）
│   ├── prisma/app.db     # SQLite DB
│   └── uploads/          # ユーザー画像
├── docs/                 # ドキュメント
├── .env                  # 環境変数（Git管理外）
├── docker-compose.yml            # 開発環境用
├── docker-compose.production.yml # 本番環境用
├── Dockerfile                    # 開発用
├── Dockerfile.production         # 本番用（マルチステージビルド）
└── README.md
```

## 🔧 開発コマンド

```bash
# ログ確認
docker logs kueli-app -f

# コンテナに入る
docker exec -it kueli-app sh

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
├── prisma/app.db    # SQLite データベース
└── uploads/         # アップロード画像
```

**バックアップ**:
```bash
tar -czf backup-$(date +%Y%m%d).tar.gz data/
```

## 🔐 環境変数

| 変数名 | 説明 |
|--------|------|
| `SESSION_SECRET` | セッション暗号化キー（32文字以上、必須） |

## 📝 ライセンス

MIT
