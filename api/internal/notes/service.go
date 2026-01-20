package notes

import "context"

type Service struct {
	Store Store
}

func NewService(store Store) *Service {
	return &Service{Store: store}
}

func (s *Service) List(ctx context.Context, opts ListOptions) ([]Note, string, bool, error) {
	return s.Store.List(ctx, opts)
}

func (s *Service) Get(ctx context.Context, id string) (Note, error) {
	return s.Store.Get(ctx, id)
}

func (s *Service) Create(ctx context.Context, payload NotePayload) (Note, error) {
	return s.Store.Create(ctx, payload)
}

func (s *Service) Update(ctx context.Context, id string, payload NotePayload) (Note, error) {
	return s.Store.Update(ctx, id, payload)
}

func (s *Service) Delete(ctx context.Context, id string) error {
	return s.Store.Delete(ctx, id)
}

func (s *Service) TogglePin(ctx context.Context, id string) (Note, error) {
	return s.Store.TogglePin(ctx, id)
}

func (s *Service) ToggleArchive(ctx context.Context, id string) (Note, error) {
	return s.Store.ToggleArchive(ctx, id)
}

func (s *Service) Duplicate(ctx context.Context, id string) (Note, error) {
	return s.Store.Duplicate(ctx, id)
}

func (s *Service) ListVersions(ctx context.Context, noteID string) ([]NoteVersion, error) {
	return s.Store.ListVersions(ctx, noteID)
}

func (s *Service) GetVersion(ctx context.Context, versionID string) (NoteVersion, error) {
	return s.Store.GetVersion(ctx, versionID)
}

func (s *Service) RestoreVersion(ctx context.Context, versionID string) (Note, error) {
	return s.Store.RestoreVersion(ctx, versionID)
}

func (s *Service) DeleteVersion(ctx context.Context, versionID string) error {
	return s.Store.DeleteVersion(ctx, versionID)
}

func (s *Service) Backlinks(ctx context.Context, noteID string) ([]Note, error) {
	return s.Store.Backlinks(ctx, noteID)
}
