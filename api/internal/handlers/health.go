package handlers

import (
	"net/http"
	"time"

	"kueli-api/internal/httpx"
)

type HealthResponse struct {
	Status string `json:"status"`
	Time   string `json:"time"`
}

func Health() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, HealthResponse{
			Status: "ok",
			Time:   time.Now().UTC().Format(time.RFC3339),
		})
	}
}
