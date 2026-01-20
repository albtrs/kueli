package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"kueli-api/internal/httpx"
	"kueli-api/internal/notes"

	"github.com/go-chi/chi/v5"
)

type NotesHandler struct {
	DB *sql.DB
}

type notesPageResponse struct {
	Notes      []notes.Note `json:"notes"`
	NextCursor string       `json:"nextCursor"`
	HasMore    bool         `json:"hasMore"`
}

func (h *NotesHandler) List(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	limit := parseInt(query.Get("limit"), 20)
	opts := notes.ListOptions{
		Cursor:          query.Get("cursor"),
		Limit:           limit,
		Tag:             query.Get("tag"),
		Search:          query.Get("search"),
		IncludeArchived: parseBool(query.Get("includeArchived")),
		ExcludePinned:   parseBool(query.Get("excludePinned")),
		SortOrder:       query.Get("sort"),
	}

	items, nextCursor, hasMore, err := notes.List(r.Context(), h.DB, opts)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, notesPageResponse{
		Notes:      items,
		NextCursor: nextCursor,
		HasMore:    hasMore,
	})
}

func (h *NotesHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing note id"})
		return
	}

	note, err := notes.Get(r.Context(), h.DB, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "Note not found"})
			return
		}
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, note)
}

func (h *NotesHandler) Create(w http.ResponseWriter, r *http.Request) {
	var payload notes.NotePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	note, err := notes.Create(r.Context(), h.DB, payload)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, note)
}

func (h *NotesHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing note id"})
		return
	}

	var payload notes.NotePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	note, err := notes.Update(r.Context(), h.DB, id, payload)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "Note not found"})
			return
		}
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, note)
}

func (h *NotesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing note id"})
		return
	}

	if err := notes.Delete(r.Context(), h.DB, id); err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *NotesHandler) TogglePin(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing note id"})
		return
	}

	note, err := notes.TogglePin(r.Context(), h.DB, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "Note not found"})
			return
		}
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, note)
}

func (h *NotesHandler) ToggleArchive(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing note id"})
		return
	}

	note, err := notes.ToggleArchive(r.Context(), h.DB, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "Note not found"})
			return
		}
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, note)
}

func (h *NotesHandler) Duplicate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing note id"})
		return
	}

	note, err := notes.Duplicate(r.Context(), h.DB, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "Note not found"})
			return
		}
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, note)
}

func (h *NotesHandler) Versions(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing note id"})
		return
	}

	versions, err := notes.ListVersions(r.Context(), h.DB, id)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, versions)
}

func (h *NotesHandler) Version(w http.ResponseWriter, r *http.Request) {
	versionID := chi.URLParam(r, "id")
	if versionID == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing version id"})
		return
	}

	version, err := notes.GetVersion(r.Context(), h.DB, versionID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "Version not found"})
			return
		}
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, version)
}

func (h *NotesHandler) RestoreVersion(w http.ResponseWriter, r *http.Request) {
	versionID := chi.URLParam(r, "id")
	if versionID == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing version id"})
		return
	}

	note, err := notes.RestoreVersion(r.Context(), h.DB, versionID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "Version not found"})
			return
		}
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, note)
}

func (h *NotesHandler) DeleteVersion(w http.ResponseWriter, r *http.Request) {
	versionID := chi.URLParam(r, "id")
	if versionID == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing version id"})
		return
	}

	if err := notes.DeleteVersion(r.Context(), h.DB, versionID); err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *NotesHandler) Backlinks(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing note id"})
		return
	}

	results, err := notes.Backlinks(r.Context(), h.DB, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "Note not found"})
			return
		}
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, results)
}

func parseInt(value string, fallback int) int {
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func parseBool(value string) bool {
	value = strings.TrimSpace(strings.ToLower(value))
	return value == "true" || value == "1" || value == "yes"
}
