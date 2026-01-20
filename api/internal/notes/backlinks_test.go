package notes

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

func TestBacklinks(t *testing.T) {
	db, err := sql.Open("sqlite", "file::memory:?cache=shared")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	_, err = db.Exec(`
CREATE TABLE Note (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  images TEXT NOT NULL DEFAULT '[]',
  isPinned BOOLEAN NOT NULL DEFAULT false,
  isArchived BOOLEAN NOT NULL DEFAULT false,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
)`)
	if err != nil {
		t.Fatalf("create table: %v", err)
	}

	ctx := context.Background()
	mustInsertNote(t, ctx, db, "a", "Target", "no links", 0, 100)
	mustInsertNote(t, ctx, db, "b", "Note B", "See [[Target]]", 0, 300)
	mustInsertNote(t, ctx, db, "c", "Note C", "See [[Target|alias]]", 0, 200)
	mustInsertNote(t, ctx, db, "d", "Note D", "See [[Targeted]]", 0, 400)
	mustInsertNote(t, ctx, db, "e", "Note E", "See [[Target]]", 1, 500)

	results, err := Backlinks(ctx, db, "a")
	if err != nil {
		t.Fatalf("backlinks: %v", err)
	}

	if len(results) != 2 {
		t.Fatalf("expected 2 backlinks, got %d", len(results))
	}
	if results[0].ID != "b" || results[1].ID != "c" {
		t.Fatalf("unexpected order or ids: %v, %v", results[0].ID, results[1].ID)
	}
}

func mustInsertNote(t *testing.T, ctx context.Context, db *sql.DB, id, title, content string, archived int, updatedAt int64) {
	t.Helper()
	_, err := db.ExecContext(ctx, `
INSERT INTO Note (id, title, content, tags, images, isPinned, isArchived, createdAt, updatedAt)
VALUES (?, ?, ?, '[]', '[]', 0, ?, ?, ?)`,
		id, title, content, archived, updatedAt, updatedAt,
	)
	if err != nil {
		t.Fatalf("insert note: %v", err)
	}
}
