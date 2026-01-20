# 本番移行手順（Next.js → React SPA + Go API）

既存のデータを保持したまま、本番環境を新構成に切り替えるための手順です。

## 0. 前提

- 旧環境は Next.js（/api を含む）で稼働中
- 既存 SQLite: `data/prisma/app.db`
- 画像: `data/uploads/`
- 新構成は `kueli-web` (React SPA) と `kueli-api` (Go)

## 1. 事前バックアップ

```bash
tar -czf backup-$(date +%Y%m%d).tar.gz data/
```

## 2. 旧コンテナ停止

```bash
docker compose -f docker-compose.production.yml down
```

旧構成の compose を使っている場合は、そちらで停止してください。

## 3. DB パスを移行

`data/prisma/` を廃止し、`data/db/` に移します。

```bash
mkdir -p data/db
cp -a data/prisma/app.db data/db/app.db
```

（問題なければ後で `data/prisma/` を削除してOKです）

## 4. 環境変数を更新

`.env` がない場合は `.env.sample` から作成します。

```bash
cp .env.sample .env
```

`JWT_SECRET` を必ず設定してください。

## 5. 本番 compose 起動

```bash
docker network create apps_net || true
docker compose -f docker-compose.production.yml up -d --build
```

API 起動時にマイグレーションが自動適用されます。

## 6. リバースプロキシの切り替え

`/` を web、`/api` を api に振り分けます。

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

## 7. 動作確認

- `https://<domain>/` にアクセスできる
- ログインできる
- 既存ノートが表示される
- 添付画像が表示される
- `/api/health` が `{"status":"ok",...}` を返す

## 8. 旧データの整理（任意）

問題なければ `data/prisma/` を削除してOKです。

```bash
rm -rf data/prisma
```
