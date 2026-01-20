import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-semibold">ページが見つかりません</h1>
      <Link to="/" className="text-primary hover:underline">
        ダッシュボードへ戻る
      </Link>
    </div>
  )
}
