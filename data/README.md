# Data Directory

このディレクトリはアプリケーションのデータを永続化します。

## 構造

```
data/
├── db/              # SQLiteデータベースファイル
│   └── app.db       # メインデータベース
└── uploads/         # ユーザーがアップロードした画像
    └── *.jpg/png... # 画像ファイル
```

## 注意事項

- このディレクトリの内容は`.gitignore`に追加されています
- Docker volumeとしてマウントされます
- バックアップを取る際はこのディレクトリ全体をコピーしてください

## バックアップ

```bash
# データをバックアップ
tar -czf backup-$(date +%Y%m%d).tar.gz data/

# データを復元
tar -xzf backup-YYYYMMDD.tar.gz
```
