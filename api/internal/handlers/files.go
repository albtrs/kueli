package handlers

import (
	"net/http"
	"path/filepath"
	"strings"

	"kueli-api/internal/auth"
	"kueli-api/internal/files"
	"kueli-api/internal/httpx"
)

type FilesHandler struct {
	Service *files.Service
}

type uploadResponse struct {
	Filename     string `json:"filename"`
	URL          string `json:"url"`
	Size         int64  `json:"size"`
	Type         string `json:"type"`
	Category     string `json:"category"`
	OriginalName string `json:"originalName"`
}

func (h *FilesHandler) Upload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, files.MaxFileSize+1024)

	if err := r.ParseMultipartForm(files.MaxFileSize + 1024); err != nil {
		httpx.WriteError(w, httpx.BadRequest("Invalid multipart form"))
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		httpx.WriteError(w, httpx.BadRequest("No file uploaded"))
		return
	}
	defer file.Close()

	result, err := h.Service.SaveFile(file, header)
	if err != nil {
		switch err {
		case files.ErrFileTooLarge:
			httpx.WriteError(w, httpx.BadRequest("File size must be less than 50MB"))
		case files.ErrFileTypeNotAllowed:
			httpx.WriteError(w, httpx.BadRequest("File type not allowed"))
		case files.ErrMimeMismatch:
			httpx.WriteError(w, httpx.BadRequest("File MIME type does not match extension"))
		case files.ErrSaveFailed:
			httpx.WriteError(w, httpx.InternalServerError("Failed to save file"))
		default:
			httpx.WriteError(w, httpx.InternalServerError(""))
		}
		return
	}

	httpx.WriteJSON(w, http.StatusOK, uploadResponse{
		Filename:     result.Filename,
		URL:          result.Filename,
		Size:         result.Size,
		Type:         result.Type,
		Category:     result.Category,
		OriginalName: result.OriginalName,
	})
}

func (h *FilesHandler) Serve(w http.ResponseWriter, r *http.Request, filename string) {
	if _, ok := auth.UserFromContext(r.Context()); !ok {
		httpx.WriteError(w, httpx.Unauthorized(""))
		return
	}

	data, err := h.Service.ServeFile(filename)
	if err != nil {
		switch err {
		case files.ErrInvalidFilename:
			httpx.WriteError(w, httpx.BadRequest("Invalid filename"))
		case files.ErrFileNotFound:
			httpx.WriteError(w, httpx.NotFound("File not found"))
		default:
			httpx.WriteError(w, httpx.InternalServerError(""))
		}
		return
	}

	headers := w.Header()
	headers.Set("Content-Type", data.MimeType)
	headers.Set("Cache-Control", "private, max-age=31536000, immutable")
	headers.Set("Vary", "Authorization, Cookie")
	headers.Set("X-Content-Type-Options", "nosniff")

	ext := strings.ToLower(filepath.Ext(data.Filename))
	if ext == ".svg" || data.MimeType == "application/octet-stream" {
		headers.Set("Content-Disposition", "attachment; filename=\""+data.Filename+"\"")
	}

	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data.Data)
}
