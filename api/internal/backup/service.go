package backup

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"
)

type Service struct {
	Store Store
}

type NoteExport struct {
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

type VersionExport struct {
	ID        string `json:"id"`
	NoteID    string `json:"noteId"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	Tags      string `json:"tags"`
	CreatedAt string `json:"createdAt"`
}

type ExportPayload struct {
	Version      int             `json:"version"`
	ExportedAt   string          `json:"exportedAt"`
	NoteCount    int             `json:"noteCount"`
	VersionCount int             `json:"versionCount"`
	Notes        []NoteExport    `json:"notes"`
	Versions     []VersionExport `json:"versions"`
}

type ImportResult struct {
	Success         bool     `json:"success"`
	Created         int      `json:"created"`
	Updated         int      `json:"updated"`
	VersionsCreated int      `json:"versionsCreated"`
	Errors          []string `json:"errors"`
}

type Store interface {
	FetchNotes(ctx context.Context) ([]NoteExport, error)
	FetchVersions(ctx context.Context) ([]VersionExport, error)
	FetchExistingNoteIDs(ctx context.Context, notes []NoteExport) (map[string]struct{}, error)
	FetchValidNoteIDs(ctx context.Context, notes []NoteExport) (map[string]struct{}, error)
	FetchExistingVersionIDs(ctx context.Context, versions []VersionExport) (map[string]struct{}, error)
	UpsertNotes(ctx context.Context, notes []NoteExport) error
	InsertVersions(ctx context.Context, versions []VersionExport, validIDs map[string]struct{}) (int, error)
}

type SQLStore struct {
	DB *sql.DB
}

func NewService(db *sql.DB) *Service {
	return &Service{Store: &SQLStore{DB: db}}
}

func (s *Service) Export(ctx context.Context) ([]byte, error) {
	notesList, err := s.Store.FetchNotes(ctx)
	if err != nil {
		return nil, err
	}
	versionsList, err := s.Store.FetchVersions(ctx)
	if err != nil {
		return nil, err
	}
	payload := ExportPayload{
		Version:      2,
		ExportedAt:   time.Now().UTC().Format(time.RFC3339),
		NoteCount:    len(notesList),
		VersionCount: len(versionsList),
		Notes:        notesList,
		Versions:     versionsList,
	}

	return json.MarshalIndent(payload, "", "  ")
}

func (s *Service) Import(ctx context.Context, payload ExportPayload) (ImportResult, error) {
	result := ImportResult{
		Success: false,
		Errors:  []string{},
	}

	if payload.Notes == nil {
		result.Errors = append(result.Errors, "無効なバックアップファイルです。notesフィールドが見つかりません。")
		return result, nil
	}

	existingIDs, err := s.Store.FetchExistingNoteIDs(ctx, payload.Notes)
	if err != nil {
		result.Errors = append(result.Errors, "インポート中にエラーが発生しました")
		return result, nil
	}

	for _, note := range payload.Notes {
		if _, ok := existingIDs[note.ID]; ok {
			result.Updated++
		} else {
			result.Created++
		}
	}

	if err := s.Store.UpsertNotes(ctx, payload.Notes); err != nil {
		result.Errors = append(result.Errors, err.Error())
		return result, nil
	}

	if len(payload.Versions) > 0 {
		validIDs, err := s.Store.FetchValidNoteIDs(ctx, payload.Notes)
		if err != nil {
			result.Errors = append(result.Errors, "インポート中にエラーが発生しました")
			return result, nil
		}

		created, err := s.Store.InsertVersions(ctx, payload.Versions, validIDs)
		if err != nil {
			result.Errors = append(result.Errors, err.Error())
			return result, nil
		}
		result.VersionsCreated += created
	}

	result.Success = true
	return result, nil
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
