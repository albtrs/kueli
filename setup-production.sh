#!/bin/sh
# Kueli 本番環境セットアップスクリプト
set -e

echo "🚀 Kueli 本番環境セットアップを開始します..."

# .envファイルの確認
if [ ! -f .env ]; then
  echo "⚠️  .envファイルが見つかりません。作成します..."
  SESSION_SECRET=$(head -c 32 /dev/urandom | base64 | tr -d '\n' | head -c 48)
  echo "SESSION_SECRET=\"${SESSION_SECRET}\"" > .env
  echo "✅ .envファイルを作成しました（SESSION_SECRETを自動生成）"
fi

# データディレクトリの作成
echo "📁 データディレクトリを作成中..."
mkdir -p data/uploads data/prisma

# Dockerイメージのビルド
echo "🔨 Dockerイメージをビルド中（数分かかります）..."
docker compose -f docker-compose.production.yml build

# コンテナを起動
echo "🐳 コンテナを起動中..."
docker compose -f docker-compose.production.yml up -d

# アプリケーションの起動を待機
echo "⏳ アプリケーションの起動を待機中..."
sleep 15

# ヘルスチェック
echo "🔍 ヘルスチェック中..."
for i in 1 2 3 4 5; do
  if wget -q --spider http://localhost:3001/login 2>/dev/null; then
    echo "✅ アプリケーションが起動しました"
    break
  fi
  echo "   待機中... ($i/5)"
  sleep 5
done

# 管理コンテナでユーザー作成
echo ""
echo "👤 管理者ユーザーを作成します"
echo ""
read -p "ユーザー名 (デフォルト: admin): " USERNAME
USERNAME=${USERNAME:-admin}
read -s -p "パスワード (デフォルト: password123456): " PASSWORD
PASSWORD=${PASSWORD:-password123456}
echo ""

echo "🗄️  データベースをセットアップ中..."
docker compose -f docker-compose.production.yml run --rm admin sh -c "npx prisma db push && npx tsx scripts/user-manage.ts reset '$USERNAME' '$PASSWORD'"

echo ""
echo "✅ セットアップ完了！"
echo ""
echo "📝 アクセス情報:"
echo "   URL: http://localhost:3001"
echo "   ユーザー名: $USERNAME"
echo ""
echo "🔧 管理コマンド:"
echo "   ログ確認:     docker logs kueli-app -f"
echo "   再起動:       docker compose -f docker-compose.production.yml restart"
echo "   停止:         docker compose -f docker-compose.production.yml down"
echo "   ユーザー管理: docker compose -f docker-compose.production.yml run --rm admin sh"
echo "                 (コンテナ内で npm run user:list などを実行)"
