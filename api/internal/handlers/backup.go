package handlers

import (
	"encoding/json"
	"net/http"

	"kueli-api/internal/backup"
	"kueli-api/internal/httpx"
)

type BackupHandler struct {
	Service *backup.Service
}

func (h *BackupHandler) Export(w http.ResponseWriter, r *http.Request) {
	payload, err := h.Service.Export(r.Context())
	if err != nil {
		httpx.WriteError(w, httpx.InternalServerError(""))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(payload)
}

func (h *BackupHandler) Import(w http.ResponseWriter, r *http.Request) {
	var payload backup.ExportPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httpx.WriteJSON(w, http.StatusOK, backup.ImportResult{
			Success: false,
			Errors:  []string{"JSONの解析に失敗しました。ファイル形式を確認してください。"},
		})
		return
	}

	result, _ := h.Service.Import(r.Context(), payload)
	httpx.WriteJSON(w, http.StatusOK, result)
}
