package handlers

import (
	"io"
	"net/http"
	"strings"

	"kueli-api/internal/attachments"
	"kueli-api/internal/files"
	"kueli-api/internal/httpx"
)

type AttachmentsHandler struct {
	Service *attachments.Service
}

func (h *AttachmentsHandler) List(w http.ResponseWriter, r *http.Request) {
	result, err := h.Service.List(r.Context())
	if err != nil {
		httpx.WriteError(w, httpx.InternalServerError(""))
		return
	}

	httpx.WriteJSON(w, http.StatusOK, result)
}

func (h *AttachmentsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Filenames []string `json:"filenames"`
	}
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if len(payload.Filenames) == 0 {
		httpx.WriteError(w, httpx.BadRequest("No filenames provided"))
		return
	}

	result, err := h.Service.Delete(r.Context(), payload.Filenames)
	if err != nil {
		httpx.WriteError(w, httpx.InternalServerError(""))
		return
	}

	httpx.WriteJSON(w, http.StatusOK, result)
}

func (h *AttachmentsHandler) Export(w http.ResponseWriter, r *http.Request) {
	result, err := h.Service.Export(r.Context())
	if err != nil {
		if err == attachments.ErrNoAttachments {
			httpx.WriteError(w, httpx.NotFound("添付ファイルがありません"))
			return
		}
		httpx.WriteError(w, httpx.InternalServerError(""))
		return
	}

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+result.Filename+"\"")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(result.Data)
}

func (h *AttachmentsHandler) Import(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, files.MaxFileSize*2)

	if err := r.ParseMultipartForm(files.MaxFileSize * 2); err != nil {
		httpx.WriteError(w, httpx.BadRequest("Invalid multipart form"))
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		httpx.WriteError(w, httpx.BadRequest("ファイルがアップロードされていません"))
		return
	}
	defer file.Close()

	if !strings.HasSuffix(strings.ToLower(header.Filename), ".zip") && !strings.Contains(header.Header.Get("Content-Type"), "zip") {
		httpx.WriteError(w, httpx.BadRequest("ZIPファイルを選択してください"))
		return
	}

	buf, err := io.ReadAll(file)
	if err != nil {
		httpx.WriteError(w, httpx.InternalServerError(""))
		return
	}

	result, err := h.Service.Import(r.Context(), buf)
	if err != nil {
		switch err {
		case attachments.ErrInvalidZip:
			httpx.WriteError(w, httpx.BadRequest("Invalid zip file"))
		case attachments.ErrCreateDir:
			httpx.WriteError(w, httpx.InternalServerError(""))
		default:
			httpx.WriteError(w, httpx.InternalServerError(""))
		}
		return
	}

	httpx.WriteJSON(w, http.StatusOK, result)
}
