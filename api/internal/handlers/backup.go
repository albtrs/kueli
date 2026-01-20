package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"kueli-api/internal/httpx"
)

type BackupHandler struct {
	DB *sql.DB
}

type noteExport struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Content    string `json:"content"`
	Tags       string `json:"tags"`
	Images     string `json:"images"`
	IsPinned   bool   `json:"isPinned"`
	IsArchived bool   `json:"isArchived"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
}

type versionExport struct {
	ID        string `json:"id"`
	NoteID    string `json:"noteId"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	Tags      string `json:"tags"`
	CreatedAt string `json:"createdAt"`
}

type exportPayload struct {
	Version      int            `json:"version"`
	ExportedAt   string         `json:"exportedAt"`
	NoteCount    int            `json:"noteCount"`
	VersionCount int            `json:"versionCount"`
	Notes        []noteExport   `json:"notes"`
	Versions     []versionExport `json:"versions"`
}

type importResult struct {
	Success        bool     `json:"success"`
	Created        int      `json:"created"`
	Updated        int      `json:"updated"`
	VersionsCreated int     `json:"versionsCreated"`
	Errors         []string `json:"errors"`
}

func (h *BackupHandler) Export(w http.ResponseWriter, r *http.Request) {
	notesRows, err := h.DB.QueryContext(r.Context(), `
SELECT id, title, content, tags, images, isPinned, isArchived, createdAt, updatedAt
FROM Note
ORDER BY updatedAt DESC
`)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}
	defer notesRows.Close()

	notesList := []noteExport{}
	for notesRows.Next() {
		var item noteExport
		var createdAt any
		var updatedAt any
		if err := notesRows.Scan(&item.ID, &item.Title, &item.Content, &item.Tags, &item.Images, &item.IsPinned, &item.IsArchived, &createdAt, &updatedAt); err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
			return
		}
		item.CreatedAt = formatTime(createdAt)
		item.UpdatedAt = formatTime(updatedAt)
		notesList = append(notesList, item)
	}
	if err := notesRows.Err(); err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	versionRows, err := h.DB.QueryContext(r.Context(), `
SELECT id, noteId, title, content, tags, createdAt
FROM NoteVersion
ORDER BY createdAt DESC
`)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}
	defer versionRows.Close()

	versionsList := []versionExport{}
	for versionRows.Next() {
		var item versionExport
		var createdAt any
		if err := versionRows.Scan(&item.ID, &item.NoteID, &item.Title, &item.Content, &item.Tags, &createdAt); err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
			return
		}
		item.CreatedAt = formatTime(createdAt)
		versionsList = append(versionsList, item)
	}
	if err := versionRows.Err(); err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	payload := exportPayload{
		Version:      2,
		ExportedAt:   time.Now().UTC().Format(time.RFC3339),
		NoteCount:    len(notesList),
		VersionCount: len(versionsList),
		Notes:        notesList,
		Versions:     versionsList,
	}

	response, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(response)
}

func (h *BackupHandler) Import(w http.ResponseWriter, r *http.Request) {
	var payload exportPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httpx.WriteJSON(w, http.StatusOK, importResult{
			Success: false,
			Errors:  []string{"JSONの解析に失敗しました。ファイル形式を確認してください。"},
		})
		return
	}

	result := importResult{
		Success: false,
		Errors:  []string{},
	}

	if payload.Notes == nil {
		result.Errors = append(result.Errors, "無効なバックアップファイルです。notesフィールドが見つかりません。")
		httpx.WriteJSON(w, http.StatusOK, result)
		return
	}

	ctx := r.Context()
	existingIDs, err := fetchExistingNoteIDs(ctx, h.DB, payload.Notes)
	if err != nil {
		result.Errors = append(result.Errors, "インポート中にエラーが発生しました")
		httpx.WriteJSON(w, http.StatusOK, result)
		return
	}

	for _, note := range payload.Notes {
		if _, ok := existingIDs[note.ID]; ok {
			result.Updated++
		} else {
			result.Created++
		}
	}

	err = withTxBackup(ctx, h.DB, func(tx *sql.Tx) error {
		for _, note := range payload.Notes {
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
	if err != nil {
		result.Errors = append(result.Errors, err.Error())
		httpx.WriteJSON(w, http.StatusOK, result)
		return
	}

	if len(payload.Versions) > 0 {
		validIDs, err := fetchValidNoteIDs(ctx, h.DB, payload.Notes)
		if err != nil {
			result.Errors = append(result.Errors, "インポート中にエラーが発生しました")
			httpx.WriteJSON(w, http.StatusOK, result)
			return
		}

		existingVersions, err := fetchExistingVersionIDs(ctx, h.DB, payload.Versions)
		if err != nil {
			result.Errors = append(result.Errors, "インポート中にエラーが発生しました")
			httpx.WriteJSON(w, http.StatusOK, result)
			return
		}

		err = withTxBackup(ctx, h.DB, func(tx *sql.Tx) error {
			for _, version := range payload.Versions {
				if _, ok := validIDs[version.NoteID]; !ok {
					continue
				}
				if _, exists := existingVersions[version.ID]; exists {
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
				result.VersionsCreated++
			}
			return nil
		})
		if err != nil {
			result.Errors = append(result.Errors, err.Error())
			httpx.WriteJSON(w, http.StatusOK, result)
			return
		}
	}

	result.Success = true
	httpx.WriteJSON(w, http.StatusOK, result)
}

func fetchExistingNoteIDs(ctx context.Context, db *sql.DB, notes []noteExport) (map[string]struct{}, error) {
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
	rows, err := db.QueryContext(ctx, query, ids...)
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

func fetchValidNoteIDs(ctx context.Context, db *sql.DB, notes []noteExport) (map[string]struct{}, error) {
	result := map[string]struct{}{}
	for _, note := range notes {
		result[note.ID] = struct{}{}
	}

	rows, err := db.QueryContext(ctx, `SELECT id FROM Note`)
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

func fetchExistingVersionIDs(ctx context.Context, db *sql.DB, versions []versionExport) (map[string]struct{}, error) {
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
	rows, err := db.QueryContext(ctx, query, ids...)
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

func formatTime(value any) string {
	parsed, ok := parseTimeValue(value)
	if !ok {
		return time.Now().UTC().Format(time.RFC3339)
	}
	return time.UnixMilli(parsed).UTC().Format(time.RFC3339)
}

func parseTimeValue(value any) (int64, bool) {
	switch v := value.(type) {
	case int64:
		return v, true
	case float64:
		return int64(v), true
	case []byte:
		return parseTimeStringRaw(string(v))
	case string:
		return parseTimeStringRaw(v)
	default:
		return 0, false
	}
}

func parseTimeStringRaw(value string) (int64, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, false
	}
	if digitsOnly(value) {
		parsed, err := strconv.ParseInt(value, 10, 64)
		if err == nil {
			return parsed, true
		}
	}
	if parsed, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return parsed.UnixMilli(), true
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed.UnixMilli(), true
	}
	if parsed, err := time.Parse("2006-01-02 15:04:05", value); err == nil {
		return parsed.UnixMilli(), true
	}
	return 0, false
}

func parseTimeString(value string) (time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Now().UTC(), nil
	}
	if millis, ok := parseTimeStringRaw(value); ok {
		return time.UnixMilli(millis).UTC(), nil
	}
	return time.Time{}, errors.New("invalid time")
}

func digitsOnly(value string) bool {
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func withTxBackup(ctx context.Context, db *sql.DB, fn func(*sql.Tx) error) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}
