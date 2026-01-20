package handlers

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"kueli-api/internal/httpx"
	"kueli-api/internal/notes"

	"github.com/go-chi/chi/v5"
)

type NotesHandler struct {
	Service *notes.Service
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

	items, nextCursor, hasMore, err := h.Service.List(r.Context(), opts)
	if err != nil {
		httpx.WriteError(w, httpx.InternalServerError(""))
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
		httpx.WriteError(w, httpx.BadRequest("Missing note id"))
		return
	}

	note, err := h.Service.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteError(w, httpx.NotFound("Note not found"))
			return
		}
		httpx.WriteError(w, httpx.InternalServerError(""))
		return
	}

	httpx.WriteJSON(w, http.StatusOK, note)
}

func (h *NotesHandler) Create(w http.ResponseWriter, r *http.Request) {
	var payload notes.NotePayload
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.WriteError(w, err)
		return
	}

	note, err := h.Service.Create(r.Context(), payload)
	if err != nil {
		httpx.WriteError(w, httpx.InternalServerError(""))
		return
	}

	httpx.WriteJSON(w, http.StatusOK, note)
}

func (h *NotesHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		httpx.WriteError(w, httpx.BadRequest("Missing note id"))
		return
	}

	var payload notes.NotePayload
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.WriteError(w, err)
		return
	}

	note, err := h.Service.Update(r.Context(), id, payload)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteError(w, httpx.NotFound("Note not found"))
			return
		}
		httpx.WriteError(w, httpx.InternalServerError(""))
		return
	}

	httpx.WriteJSON(w, http.StatusOK, note)
}

func (h *NotesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		httpx.WriteError(w, httpx.BadRequest("Missing note id"))
		return
	}

	if err := h.Service.Delete(r.Context(), id); err != nil {
		httpx.WriteError(w, httpx.InternalServerError(""))
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *NotesHandler) TogglePin(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		httpx.WriteError(w, httpx.BadRequest("Missing note id"))
		return
	}

	note, err := h.Service.TogglePin(r.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteError(w, httpx.NotFound("Note not found"))
			return
		}
		httpx.WriteError(w, httpx.InternalServerError(""))
		return
	}

	httpx.WriteJSON(w, http.StatusOK, note)
}

func (h *NotesHandler) ToggleArchive(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		httpx.WriteError(w, httpx.BadRequest("Missing note id"))
		return
	}

	note, err := h.Service.ToggleArchive(r.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteError(w, httpx.NotFound("Note not found"))
			return
		}
		httpx.WriteError(w, httpx.InternalServerError(""))
		return
	}

	httpx.WriteJSON(w, http.StatusOK, note)
}

func (h *NotesHandler) Duplicate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		httpx.WriteError(w, httpx.BadRequest("Missing note id"))
		return
	}

	note, err := h.Service.Duplicate(r.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteError(w, httpx.NotFound("Note not found"))
			return
		}
		httpx.WriteError(w, httpx.InternalServerError(""))
		return
	}

	httpx.WriteJSON(w, http.StatusOK, note)
}

func (h *NotesHandler) Versions(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		httpx.WriteError(w, httpx.BadRequest("Missing note id"))
		return
	}

	versions, err := h.Service.ListVersions(r.Context(), id)
	if err != nil {
		httpx.WriteError(w, httpx.InternalServerError(""))
		return
	}

	httpx.WriteJSON(w, http.StatusOK, versions)
}

func (h *NotesHandler) Version(w http.ResponseWriter, r *http.Request) {
	versionID := chi.URLParam(r, "id")
	if versionID == "" {
		httpx.WriteError(w, httpx.BadRequest("Missing version id"))
		return
	}

	version, err := h.Service.GetVersion(r.Context(), versionID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteError(w, httpx.NotFound("Version not found"))
			return
		}
		httpx.WriteError(w, httpx.InternalServerError(""))
		return
	}

	httpx.WriteJSON(w, http.StatusOK, version)
}

func (h *NotesHandler) RestoreVersion(w http.ResponseWriter, r *http.Request) {
	versionID := chi.URLParam(r, "id")
	if versionID == "" {
		httpx.WriteError(w, httpx.BadRequest("Missing version id"))
		return
	}

	note, err := h.Service.RestoreVersion(r.Context(), versionID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteError(w, httpx.NotFound("Version not found"))
			return
		}
		httpx.WriteError(w, httpx.InternalServerError(""))
		return
	}

	httpx.WriteJSON(w, http.StatusOK, note)
}

func (h *NotesHandler) DeleteVersion(w http.ResponseWriter, r *http.Request) {
	versionID := chi.URLParam(r, "id")
	if versionID == "" {
		httpx.WriteError(w, httpx.BadRequest("Missing version id"))
		return
	}

	if err := h.Service.DeleteVersion(r.Context(), versionID); err != nil {
		httpx.WriteError(w, httpx.InternalServerError(""))
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *NotesHandler) Backlinks(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		httpx.WriteError(w, httpx.BadRequest("Missing note id"))
		return
	}

	results, err := h.Service.Backlinks(r.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteError(w, httpx.NotFound("Note not found"))
			return
		}
		httpx.WriteError(w, httpx.InternalServerError(""))
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
