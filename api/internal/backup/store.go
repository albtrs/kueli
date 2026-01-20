package backup

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"kueli-api/internal/dbx"
)

func (s *SQLStore) FetchNotes(ctx context.Context) ([]NoteExport, error) {
	notesRows, err := s.DB.QueryContext(ctx, `
SELECT id, title, content, tags, images, isPinned, isArchived, createdAt, updatedAt
FROM Note
ORDER BY updatedAt DESC
`)
	if err != nil {
		return nil, err
	}
	defer notesRows.Close()

	notesList := []NoteExport{}
	for notesRows.Next() {
		var item NoteExport
		var createdAt any
		var updatedAt any
		if err := notesRows.Scan(&item.ID, &item.Title, &item.Content, &item.Tags, &item.Images, &item.IsPinned, &item.IsArchived, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		item.CreatedAt = formatTime(createdAt)
		item.UpdatedAt = formatTime(updatedAt)
		notesList = append(notesList, item)
	}
	if err := notesRows.Err(); err != nil {
		return nil, err
	}
	return notesList, nil
}

func (s *SQLStore) FetchVersions(ctx context.Context) ([]VersionExport, error) {
	versionRows, err := s.DB.QueryContext(ctx, `
SELECT id, noteId, title, content, tags, createdAt
FROM NoteVersion
ORDER BY createdAt DESC
`)
	if err != nil {
		return nil, err
	}
	defer versionRows.Close()

	versionsList := []VersionExport{}
	for versionRows.Next() {
		var item VersionExport
		var createdAt any
		if err := versionRows.Scan(&item.ID, &item.NoteID, &item.Title, &item.Content, &item.Tags, &createdAt); err != nil {
			return nil, err
		}
		item.CreatedAt = formatTime(createdAt)
		versionsList = append(versionsList, item)
	}
	if err := versionRows.Err(); err != nil {
		return nil, err
	}
	return versionsList, nil
}

func (s *SQLStore) FetchExistingNoteIDs(ctx context.Context, notes []NoteExport) (map[string]struct{}, error) {
	ids := make([]any, 0, len(notes))
	for _, note := range notes {
		if note.ID != "" {
			ids = append(ids, note.ID)
		}
	}
	if len(ids) == 0 {
		return map[string]struct{}{}, nil
	}

	query := `SELECT id FROM Note WHERE id IN (` + strings.Repeat("?,", len(ids)-1) + `?)`
	rows, err := s.DB.QueryContext(ctx, query, ids...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := map[string]struct{}{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		result[id] = struct{}{}
	}
	return result, rows.Err()
}

func (s *SQLStore) FetchValidNoteIDs(ctx context.Context, notes []NoteExport) (map[string]struct{}, error) {
	result := map[string]struct{}{}
	for _, note := range notes {
		result[note.ID] = struct{}{}
	}

	rows, err := s.DB.QueryContext(ctx, `SELECT id FROM Note`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		result[id] = struct{}{}
	}
	return result, rows.Err()
}

func (s *SQLStore) FetchExistingVersionIDs(ctx context.Context, versions []VersionExport) (map[string]struct{}, error) {
	ids := make([]any, 0, len(versions))
	for _, version := range versions {
		if version.ID != "" {
			ids = append(ids, version.ID)
		}
	}
	if len(ids) == 0 {
		return map[string]struct{}{}, nil
	}
	query := `SELECT id FROM NoteVersion WHERE id IN (` + strings.Repeat("?,", len(ids)-1) + `?)`
	rows, err := s.DB.QueryContext(ctx, query, ids...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := map[string]struct{}{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		result[id] = struct{}{}
	}
	return result, rows.Err()
}

func (s *SQLStore) UpsertNotes(ctx context.Context, notes []NoteExport) error {
	return dbx.WithTx(ctx, s.DB, func(tx *sql.Tx) error {
		for _, note := range notes {
			createdAt, err := parseTimeString(note.CreatedAt)
			if err != nil {
				return errors.New("無効な作成日時: " + note.ID)
			}
			updatedAt, err := parseTimeString(note.UpdatedAt)
			if err != nil {
				return errors.New("無効な更新日時: " + note.ID)
			}

			title := note.Title
			content := note.Content
			tags := note.Tags
			images := note.Images
			if tags == "" {
				tags = "[]"
			}
			if images == "" {
				images = "[]"
			}

			_, err = tx.ExecContext(ctx, `
INSERT INTO Note (id, title, content, tags, images, isPinned, isArchived, createdAt, updatedAt)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  content = excluded.content,
  tags = excluded.tags,
  images = excluded.images,
  isPinned = excluded.isPinned,
  isArchived = excluded.isArchived,
  createdAt = excluded.createdAt,
  updatedAt = excluded.updatedAt
`, note.ID, title, content, tags, images, note.IsPinned, note.IsArchived, createdAt.UnixMilli(), updatedAt.UnixMilli())
			if err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *SQLStore) InsertVersions(ctx context.Context, versions []VersionExport, validIDs map[string]struct{}) (int, error) {
	created := 0
	err := dbx.WithTx(ctx, s.DB, func(tx *sql.Tx) error {
		existing, err := s.FetchExistingVersionIDs(ctx, versions)
		if err != nil {
			return err
		}

		for _, version := range versions {
			if _, ok := validIDs[version.NoteID]; !ok {
				continue
			}
			if _, exists := existing[version.ID]; exists {
				continue
			}

			createdAt, err := parseTimeString(version.CreatedAt)
			if err != nil {
				return errors.New("無効なバージョン作成日時: " + version.ID)
			}

			tags := version.Tags
			if tags == "" {
				tags = "[]"
			}

			_, err = tx.ExecContext(ctx, `
INSERT INTO NoteVersion (id, noteId, title, content, tags, createdAt)
VALUES (?, ?, ?, ?, ?, ?)
`, version.ID, version.NoteID, version.Title, version.Content, tags, createdAt.UnixMilli())
			if err != nil {
				return err
			}
			created++
		}
		return nil
	})
	return created, err
}
