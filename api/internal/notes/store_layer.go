package notes

import (
	"context"
	"database/sql"
)

type Store interface {
	List(ctx context.Context, opts ListOptions) ([]Note, string, bool, error)
	Get(ctx context.Context, id string) (Note, error)
	Create(ctx context.Context, payload NotePayload) (Note, error)
	Update(ctx context.Context, id string, payload NotePayload) (Note, error)
	Delete(ctx context.Context, id string) error
	TogglePin(ctx context.Context, id string) (Note, error)
	ToggleArchive(ctx context.Context, id string) (Note, error)
	Duplicate(ctx context.Context, id string) (Note, error)
	ListVersions(ctx context.Context, noteID string) ([]NoteVersion, error)
	GetVersion(ctx context.Context, versionID string) (NoteVersion, error)
	RestoreVersion(ctx context.Context, versionID string) (Note, error)
	DeleteVersion(ctx context.Context, versionID string) error
	Backlinks(ctx context.Context, noteID string) ([]Note, error)
}

type SQLStore struct {
	DB *sql.DB
}

func NewStore(db *sql.DB) *SQLStore {
	return &SQLStore{DB: db}
}

func (s *SQLStore) List(ctx context.Context, opts ListOptions) ([]Note, string, bool, error) {
	return List(ctx, s.DB, opts)
}

func (s *SQLStore) Get(ctx context.Context, id string) (Note, error) {
	return Get(ctx, s.DB, id)
}

func (s *SQLStore) Create(ctx context.Context, payload NotePayload) (Note, error) {
	return Create(ctx, s.DB, payload)
}

func (s *SQLStore) Update(ctx context.Context, id string, payload NotePayload) (Note, error) {
	return Update(ctx, s.DB, id, payload)
}

func (s *SQLStore) Delete(ctx context.Context, id string) error {
	return Delete(ctx, s.DB, id)
}

func (s *SQLStore) TogglePin(ctx context.Context, id string) (Note, error) {
	return TogglePin(ctx, s.DB, id)
}

func (s *SQLStore) ToggleArchive(ctx context.Context, id string) (Note, error) {
	return ToggleArchive(ctx, s.DB, id)
}

func (s *SQLStore) Duplicate(ctx context.Context, id string) (Note, error) {
	return Duplicate(ctx, s.DB, id)
}

func (s *SQLStore) ListVersions(ctx context.Context, noteID string) ([]NoteVersion, error) {
	return ListVersions(ctx, s.DB, noteID)
}

func (s *SQLStore) GetVersion(ctx context.Context, versionID string) (NoteVersion, error) {
	return GetVersion(ctx, s.DB, versionID)
}

func (s *SQLStore) RestoreVersion(ctx context.Context, versionID string) (Note, error) {
	return RestoreVersion(ctx, s.DB, versionID)
}

func (s *SQLStore) DeleteVersion(ctx context.Context, versionID string) error {
	return DeleteVersion(ctx, s.DB, versionID)
}

func (s *SQLStore) Backlinks(ctx context.Context, noteID string) ([]Note, error) {
	return Backlinks(ctx, s.DB, noteID)
}
