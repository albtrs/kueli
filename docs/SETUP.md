# My Notes App - Setup Instructions (Git Bash on Windows)

## Architecture
- **Backend:** Next.js API Routes + Prisma ORM
- **Database:** SQLite (file-based)
- **Auth:** NextAuth.js (Credentials Provider)
- **Frontend:** Next.js 16 + React 19 + Tailwind CSS

## Prerequisites
- Docker Desktop for Windows (running)
- Git Bash

## Setup Steps

### 1. Navigate to Project Directory
```bash
cd /c/home/dev/kueli
```

### 2. Start Docker Services
```bash
docker compose up -d
```

Docker will automatically:
- Install npm dependencies
- Run `prisma generate` (generate Prisma Client)
- Run `prisma db push` (create SQLite database)
- Start Next.js dev server

### 3. Initialize Database with Sample Data
```bash
docker exec -it frontend sh -c "npx tsx prisma/seed.ts"
```

This creates:
- **User:** `user@example.com` / `password123456`
- **Sample Notes:** Welcome note and Task list

### 4. Access the Application

**Next.js Frontend:**
- URL: http://localhost:3001
- Login: `user@example.com` / `password123456`

### 5. Check Logs (Optional)
```bash
# View logs
docker compose logs -f frontend
```

### 6. Stop Services
```bash
docker compose down
```

### 7. Clean Slate (Remove all data)
```bash
docker compose down
rm -rf data/prisma/* data/uploads/*
```

## Data Persistence

All application data is stored in the `./data` directory:

```
data/
├── prisma/          # SQLite database files
│   └── dev.db       # Main database
└── uploads/         # User uploaded images
```

**Backup:** Simply copy the entire `data/` directory
**Restore:** Replace the `data/` directory with your backup

## Database Schema

### User Table
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | CUID (primary key) |
| `email` | string | ユーザーのメールアドレス (unique) |
| `password` | string | bcrypt ハッシュ化されたパスワード |
| `name` | string? | ユーザー名 (optional) |
| `createdAt` | DateTime | 作成日時 |
| `updatedAt` | DateTime | 更新日時 |

### Note Table
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | CUID (primary key) |
| `title` | string | メモのタイトル |
| `content` | string | Markdown本文 |
| `tags` | string | タグ配列のJSON文字列 |
| `images` | string | 画像ファイル名配列のJSON文字列 |
| `isPinned` | boolean | ピン留めフラグ |
| `createdAt` | DateTime | 作成日時 |
| `updatedAt` | DateTime | 更新日時 (自動更新) |

**Access:** Server Actions で認証チェック (`@request.auth.id != ''` 相当)

## Troubleshooting

### Hot Module Replacement (HMR) not working
- Ensure `WATCHPACK_POLLING=true` is set in `docker-compose.yml`
- Restart: `docker compose restart frontend`

### Permission Issues
- Ensure Docker Desktop has access to the project directory
- Check Docker Desktop > Settings > Resources > File Sharing

### Port Already in Use
- Change ports in `docker-compose.yml`: `3002:3000`

### Database Migration Issues
- Check logs: `docker compose logs frontend`
- Manual push: `docker exec -it frontend npx prisma db push`
- Reset DB: `rm -rf frontend/prisma/dev.db* && docker compose restart frontend`

## Environment Variables

The `frontend/.env` file contains:
- **`DATABASE_URL`**: SQLite database file path
- **`NEXTAUTH_SECRET`**: NextAuth.js secret key
- **`NEXTAUTH_URL`**: Application base URL

## Development Workflow

1. Edit code in `./frontend` directory
2. Changes auto-reload via HMR
3. Use Prisma Studio (optional): `docker exec -it frontend npx prisma studio`
4. Server Actions handle all backend logic
5. NextAuth.js manages authentication

## File Structure

```
frontend/
├── prisma/
│   ├── schema.prisma      # Database schema
│   ├── seed.ts            # Sample data
│   └── dev.db             # SQLite database (gitignored)
├── src/
│   ├── actions/
│   │   └── note.ts        # Server Actions (CRUD)
│   ├── app/
│   │   ├── api/auth/      # NextAuth.js endpoints
│   │   ├── login/         # Login page
│   │   ├── notes/[id]/    # Note editor
│   │   └── page.tsx       # Dashboard
│   ├── components/        # React components
│   ├── lib/
│   │   ├── prisma.ts      # Prisma Client singleton
│   │   ├── auth.ts        # Auth helper
│   │   └── types.ts       # TypeScript types
│   └── types/             # NextAuth types
└── public/uploads/        # Uploaded images (persistent volume)
```

## Next Steps

1. ✅ Database schema with Prisma
2. ✅ NextAuth.js authentication
3. ✅ Server Actions for CRUD
4. ✅ Markdown editor with CodeMirror
5. 🔜 Image upload functionality
6. 🔜 Real-time collaboration (optional)
