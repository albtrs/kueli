package notes

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"kueli-api/internal/dbx"

	"github.com/lucsky/cuid"
)

const (
	versionInterval = 30 * time.Minute
	maxVersions     = 20
)

func ListVersions(ctx context.Context, db *sql.DB, noteID string) ([]NoteVersion, error) {
	rows, err := db.QueryContext(ctx, `
SELECT id, title, content, tags, createdAt, noteId
FROM NoteVersion
WHERE noteId = ?
ORDER BY createdAt DESC
`, noteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	versions := []NoteVersion{}
	for rows.Next() {
		version, err := scanNoteVersion(rows)
		if err != nil {
			return nil, err
		}
		versions = append(versions, version)
	}
	return versions, rows.Err()
}

func GetVersion(ctx context.Context, db *sql.DB, versionID string) (NoteVersion, error) {
	row := db.QueryRowContext(ctx, `
SELECT id, title, content, tags, createdAt, noteId
FROM NoteVersion
WHERE id = ?
`, versionID)

	return scanNoteVersionRow(row)
}

func RestoreVersion(ctx context.Context, db *sql.DB, versionID string) (Note, error) {
	version, err := GetVersion(ctx, db, versionID)
	if err != nil {
		return Note{}, err
	}

	current, err := Get(ctx, db, version.NoteID)
	if err != nil {
		return Note{}, err
	}

	restoredTags := version.Tags
	if strings.TrimSpace(restoredTags) == "" || restoredTags == "[]" {
		restoredTags = ExtractTagsFromContent(version.Content)
	}

	nowMillis := time.Now().UnixMilli()

	err = dbx.WithTx(ctx, db, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `
INSERT INTO NoteVersion (id, title, content, tags, createdAt, noteId)
VALUES (?, ?, ?, ?, ?, ?)
`, cuid.New(), current.Title, current.Content, EncodeJSONList(current.Tags), nowMillis, current.ID)
		if err != nil {
			return err
		}

		_, err = tx.ExecContext(ctx, `
UPDATE Note
SET title = ?, content = ?, tags = ?, updatedAt = ?
WHERE id = ?
`, version.Title, version.Content, restoredTags, nowMillis, current.ID)
		return err
	})
	if err != nil {
		return Note{}, err
	}

	return Get(ctx, db, current.ID)
}

func DeleteVersion(ctx context.Context, db *sql.DB, versionID string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM NoteVersion WHERE id = ?`, versionID)
	return err
}

func maybeCreateVersion(ctx context.Context, tx *sql.Tx, note Note) error {
	if strings.TrimSpace(note.Title) == "" && strings.TrimSpace(note.Content) == "" {
		return nil
	}

	row := tx.QueryRowContext(ctx, `
SELECT createdAt
FROM NoteVersion
WHERE noteId = ?
ORDER BY createdAt DESC
LIMIT 1
`, note.ID)

	var lastCreated any
	if err := row.Scan(&lastCreated); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	} else if err == nil {
		lastTime := parseTimeValue(lastCreated)
		if time.Since(lastTime) <= versionInterval {
			return nil
		}
	}

	nowMillis := time.Now().UnixMilli()

	_, err := tx.ExecContext(ctx, `
INSERT INTO NoteVersion (id, title, content, tags, createdAt, noteId)
VALUES (?, ?, ?, ?, ?, ?)
`, cuid.New(), note.Title, note.Content, EncodeJSONList(note.Tags), nowMillis, note.ID)
	if err != nil {
		return err
	}

	var count int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(1) FROM NoteVersion WHERE noteId = ?`, note.ID).Scan(&count); err != nil {
		return err
	}
	if count > maxVersions {
		_, err := tx.ExecContext(ctx, `
DELETE FROM NoteVersion
WHERE id = (
  SELECT id FROM NoteVersion WHERE noteId = ? ORDER BY createdAt ASC LIMIT 1
)
`, note.ID)
		if err != nil {
			return err
		}
	}

	return nil
}
