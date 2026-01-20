package notes

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"kueli-api/internal/dbx"

	"github.com/lucsky/cuid"
)

func List(ctx context.Context, db *sql.DB, opts ListOptions) ([]Note, string, bool, error) {
	limit := opts.Limit
	if limit <= 0 {
		limit = 20
	}

	whereParts := []string{"1=1"}
	args := []any{}

	if !opts.IncludeArchived {
		whereParts = append(whereParts, "isArchived = 0")
	}

	if opts.ExcludePinned {
		whereParts = append(whereParts, "isPinned = 0")
	}

	if opts.Tag != "" {
		if opts.Tag == "__untagged__" {
			whereParts = append(whereParts, "tags = '[]'")
		} else {
			whereParts = append(whereParts, "tags LIKE ?")
			args = append(args, "%\""+opts.Tag+"\"%")
		}
	}

	if strings.TrimSpace(opts.Search) != "" {
		searchCond, searchArgs := BuildSearchCondition(opts.Search)
		if searchCond != "" {
			whereParts = append(whereParts, "("+searchCond+")")
			args = append(args, searchArgs...)
		}
	}

	sortOrder := "DESC"
	if strings.ToLower(opts.SortOrder) == "asc" {
		sortOrder = "ASC"
	}

	if opts.Cursor != "" {
		var cursorUpdatedAt any
		err := db.QueryRowContext(ctx, "SELECT updatedAt FROM Note WHERE id = ?", opts.Cursor).Scan(&cursorUpdatedAt)
		if err == nil {
			cursorMillis, ok := timeValueToMillis(cursorUpdatedAt)
			if !ok {
				cursorMillis = time.Now().UnixMilli()
			}
			if sortOrder == "DESC" {
				whereParts = append(whereParts, "(updatedAt < ? OR (updatedAt = ? AND id < ?))")
				args = append(args, cursorMillis, cursorMillis, opts.Cursor)
			} else {
				whereParts = append(whereParts, "(updatedAt > ? OR (updatedAt = ? AND id > ?))")
				args = append(args, cursorMillis, cursorMillis, opts.Cursor)
			}
		}
	}

	query := fmt.Sprintf(`
SELECT id, title, content, tags, images, isPinned, isArchived, createdAt, updatedAt
FROM Note
WHERE %s
ORDER BY updatedAt %s, id %s
LIMIT ?
`, strings.Join(whereParts, " AND "), sortOrder, sortOrder)

	args = append(args, limit+1)

	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, "", false, err
	}
	defer rows.Close()

	notes := []Note{}
	for rows.Next() {
		note, err := scanNote(rows)
		if err != nil {
			return nil, "", false, err
		}
		notes = append(notes, note)
	}

	if err := rows.Err(); err != nil {
		return nil, "", false, err
	}

	hasMore := len(notes) > limit
	if hasMore {
		notes = notes[:limit]
	}

	nextCursor := ""
	if hasMore && len(notes) > 0 {
		nextCursor = notes[len(notes)-1].ID
	}

	return notes, nextCursor, hasMore, nil
}

func Get(ctx context.Context, db *sql.DB, id string) (Note, error) {
	row := db.QueryRowContext(ctx, `
SELECT id, title, content, tags, images, isPinned, isArchived, createdAt, updatedAt
FROM Note
WHERE id = ?
`, id)

	return scanNoteRow(row)
}

func Create(ctx context.Context, db *sql.DB, payload NotePayload) (Note, error) {
	title := "無題のメモ"
	if payload.Title != nil && strings.TrimSpace(*payload.Title) != "" {
		title = *payload.Title
	}

	content := ""
	if payload.Content != nil {
		content = *payload.Content
	}

	isPinned := false
	if payload.IsPinned != nil {
		isPinned = *payload.IsPinned
	}

	tags := "[]"
	if payload.Tags != nil {
		tags = EncodeJSONList(*payload.Tags)
	}

	images := "[]"
	if payload.Images != nil {
		images = EncodeJSONList(*payload.Images)
	}

	noteID := cuid.New()
	nowMillis := time.Now().UnixMilli()

	_, err := db.ExecContext(ctx, `
INSERT INTO Note (id, title, content, tags, images, isPinned, isArchived, createdAt, updatedAt)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`, noteID, title, content, tags, images, isPinned, false, nowMillis, nowMillis)
	if err != nil {
		return Note{}, err
	}

	note, err := Get(ctx, db, noteID)
	if err != nil {
		return Note{}, err
	}

	_ = processNoteLinks(ctx, db, note.ID, note.Content)
	return note, nil
}

func Update(ctx context.Context, db *sql.DB, id string, payload NotePayload) (Note, error) {
	existing, err := Get(ctx, db, id)
	if err != nil {
		return Note{}, err
	}

	title := existing.Title
	if payload.Title != nil {
		if strings.TrimSpace(*payload.Title) == "" {
			title = "無題のメモ"
		} else {
			title = *payload.Title
		}
	}

	content := existing.Content
	if payload.Content != nil {
		content = *payload.Content
	}

	isPinned := existing.IsPinned
	if payload.IsPinned != nil {
		isPinned = *payload.IsPinned
	}

	isArchived := existing.IsArchived
	if payload.IsArchived != nil {
		isArchived = *payload.IsArchived
	}

	tags := EncodeJSONList(existing.Tags)
	if payload.Tags != nil {
		tags = EncodeJSONList(*payload.Tags)
	}

	images := EncodeJSONList(existing.Images)
	if payload.Images != nil {
		images = EncodeJSONList(*payload.Images)
	}

	nowMillis := time.Now().UnixMilli()

	err = dbx.WithTx(ctx, db, func(tx *sql.Tx) error {
		if err := maybeCreateVersion(ctx, tx, existing); err != nil {
			return err
		}

		_, err := tx.ExecContext(ctx, `
UPDATE Note
SET title = ?, content = ?, tags = ?, images = ?, isPinned = ?, isArchived = ?, updatedAt = ?
WHERE id = ?
`, title, content, tags, images, isPinned, isArchived, nowMillis, id)
		if err != nil {
			return err
		}

		return nil
	})
	if err != nil {
		return Note{}, err
	}

	if existing.Title != title {
		_ = updateWikiLinksOnTitleChange(ctx, db, id, existing.Title, title)
	}

	note, err := Get(ctx, db, id)
	if err != nil {
		return Note{}, err
	}

	_ = processNoteLinks(ctx, db, note.ID, note.Content)
	return note, nil
}

func Delete(ctx context.Context, db *sql.DB, id string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM Note WHERE id = ?`, id)
	return err
}

func TogglePin(ctx context.Context, db *sql.DB, id string) (Note, error) {
	note, err := Get(ctx, db, id)
	if err != nil {
		return Note{}, err
	}

	_, err = db.ExecContext(ctx, `UPDATE Note SET isPinned = ?, updatedAt = ? WHERE id = ?`,
		!note.IsPinned, time.Now().UnixMilli(), id)
	if err != nil {
		return Note{}, err
	}

	return Get(ctx, db, id)
}

func ToggleArchive(ctx context.Context, db *sql.DB, id string) (Note, error) {
	note, err := Get(ctx, db, id)
	if err != nil {
		return Note{}, err
	}

	newArchived := !note.IsArchived
	newPinned := note.IsPinned
	if newArchived {
		newPinned = false
	}

	_, err = db.ExecContext(ctx, `UPDATE Note SET isArchived = ?, isPinned = ?, updatedAt = ? WHERE id = ?`,
		newArchived, newPinned, time.Now().UnixMilli(), id)
	if err != nil {
		return Note{}, err
	}

	return Get(ctx, db, id)
}

func Duplicate(ctx context.Context, db *sql.DB, id string) (Note, error) {
	original, err := Get(ctx, db, id)
	if err != nil {
		return Note{}, err
	}

	noteID := cuid.New()
	nowMillis := time.Now().UnixMilli()

	_, err = db.ExecContext(ctx, `
INSERT INTO Note (id, title, content, tags, images, isPinned, isArchived, createdAt, updatedAt)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`, noteID, original.Title+"_Copy", original.Content, EncodeJSONList(original.Tags), EncodeJSONList(original.Images), false, false, nowMillis, nowMillis)
	if err != nil {
		return Note{}, err
	}

	return Get(ctx, db, noteID)
}
