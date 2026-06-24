# Kueli - Personal Note-Taking App

シンプルな個人用Markdownメモアプリです。  
**AI駆動開発で実装しました。**

## 🎯 特徴

- **Markdown編集**: CodeMirrorによる快適な編集体験
- **タグ・検索**: ハッシュタグ + 強力な検索式
- **リンク機能**: WikiLink/バックリンク/OGPプレビュー
- **画像アップロード**: ドラッグ&ドロップ対応
- **JWT認証**: access/refresh を httpOnly cookie で管理
- **SQLite永続化**: DB + ファイルストレージ
- **Docker完結**: ホスト環境を汚さない運用

## 🛠 技術スタック

| Layer | Technology |
|-------|-----------|
| Frontend | React SPA (Vite), TypeScript |
| Editor | CodeMirror 6, ReactMarkdown |
| Styling | Tailwind CSS 4, Radix UI |
| Backend | Go (chi) |
| Database | SQLite |
| Auth | JWT (access/refresh cookies) |
| Runtime | Docker, nginx (production) |

## 🚀 本番デプロイ

旧 Next.js 環境からの移行は `PRODUCTION_MIGRATION.md` を参照してください。

### 1. クローンして環境変数を設定

```bash
git clone https://github.com/albtrs/kueli.git
cd kueli

cp .env.sample .env
# .env を編集して JWT_SECRET などを設定
```

### 2. 起動

```bash
docker network create apps_net || true
docker compose -f docker-compose.production.yml up -d --build
```

### 3. リバースプロキシ

本番では `/` を web (3000)、`/api` を api (8080) に振り分けます。

```nginx
location /api/ {
  proxy_pass http://kueli-api:8080;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Authorization $http_authorization;
}
location / {
  proxy_pass http://kueli-web:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 3.1 Cloudflare キャッシュ設定

Cloudflare を使っている場合、`/api/files/` は必ずキャッシュをバイパスしてください。

方法1：Cache Rulesでパス一致 → Bypass cache（おすすめ）
Cloudflare Dashboard → Rules → Cache Rules → Create rule
条件（Expression）
Field: URI Path
Operator: starts with
Value: /api/files/
Action / Cache eligibility を Bypass cache にする
これで /api/files/ 配下にマッチしたリクエストは Cloudflare でキャッシュされません。

### 4. 初回データ

- SQLite は `data/db/app.db` を参照します。
- 旧版（Next/Prisma）の DB を持っている場合はそのまま配置すれば動きます。
- `refresh_tokens` テーブルは API 起動時に自動作成されます。

### 管理

```bash
# ログ
docker logs kueli-web -f
docker logs kueli-api -f

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
```

## 🛠 開発環境

```bash
# 開発用docker-composeを起動
docker compose up -d

# Web: http://localhost:3001
# API: http://localhost:8081/api/health
```

### 開発コマンド

```bash
# ログ確認
docker logs kueli-web -f
docker logs kueli-api -f

# コンテナに入る
docker exec -it kueli-web sh
docker exec -it kueli-api sh

# 停止
docker compose down

# データ完全削除
docker compose down && rm -rf data/db/* data/uploads/*
```

### テスト（Go）

```bash
# docker で実行
docker compose run --rm api go test ./...
```

## 👤 ユーザー管理

- ユーザー情報は SQLite の `User` テーブルに保存されます。
- ユーザー名やパスワードは `change-user.sh` で変更できます。

```bash
# 例: kueli-api-demo コンテナ内の albtrs を demouser / 新しいパスワードに変更
./change-user.sh kueli-api-demo --username admin --new-username demouser --password 'new-password'
```

- 第1引数は対象コンテナ名です（例: `kueli-api`, `kueli-api-demo`）。
- 変更後は対象ユーザーの refresh token も失効します。

## 🗂 マイグレーション

- API 起動時に自動で適用されます（golang-migrate）。
- SQL は `api/migrations/` に追加します。
- 既存DBにも適用できるよう、初期マイグレーションは `IF NOT EXISTS` を使用しています。

## 📂 プロジェクト構造

```
kueli/
├── api/                    # Go API
│   ├── cmd/kueli-api
│   ├── internal/
│   ├── Dockerfile
│   └── Dockerfile.production
├── web/                    # React SPA (Vite)
│   ├── src/
│   ├── public/
│   ├── nginx.conf
│   ├── Dockerfile
│   └── Dockerfile.production
├── data/                   # 永続化データ（Git管理外）
│   ├── db/app.db           # SQLite DB
│   └── uploads/            # アップロード画像
├── docker-compose.yml            # 開発環境用
├── docker-compose.production.yml # 本番環境用
└── README.md
```

## 💾 データ永続化

すべてのデータは `./data/` に保存されます:

```
data/
├── db/app.db        # SQLite データベース
└── uploads/         # アップロード画像
```

**バックアップ**:
```bash
tar -czf backup-$(date +%Y%m%d).tar.gz data/
```

## 🔐 環境変数

| 変数名 | 説明 |
|--------|------|
| `JWT_SECRET` | JWT署名キー（必須） |
| `DATABASE_PATH` | SQLiteファイルのパス（例: `./data/db/app.db`） |
| `DATABASE_URL` | SQLite DSN（`file:` 付きでも可） |
| `UPLOADS_DIR` | 画像保存先ディレクトリ |
| `ACCESS_TOKEN_TTL` | access token TTL（デフォルト: 15m） |
| `REFRESH_TOKEN_TTL` | refresh token TTL（デフォルト: 720h） |
| `COOKIE_DOMAIN` | Cookie のドメイン設定 |
| `COOKIE_SECURE` | Secure cookie を強制するか（true/false） |
| `VITE_API_INTERNAL_ORIGIN` | 開発時の API プロキシ先（例: `http://api:8080`） |
| `VITE_API_ORIGIN` | APIの外部URL（プロキシを使わない場合） |

## 📝 ライセンス

MIT
