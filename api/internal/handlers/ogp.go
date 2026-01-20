package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"kueli-api/internal/cache"
	"kueli-api/internal/httpx"
	"kueli-api/internal/ogp"
)

type OGPHandler struct {
	Cache *cache.Cache
}

type ogpResponse struct {
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
	Image       string `json:"image,omitempty"`
	SiteName    string `json:"siteName,omitempty"`
	URL         string `json:"url"`
}

func (h *OGPHandler) Get(w http.ResponseWriter, r *http.Request) {
	rawURL := r.URL.Query().Get("url")
	if rawURL == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "URL is required"})
		return
	}

	cacheKey := "ogp:" + rawURL
	if h.Cache != nil {
		if data, ok := h.Cache.Get(cacheKey); ok {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(data)
			return
		}
	}

	data, err := ogp.Fetch(rawURL)
	if err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	result := ogpResponse{
		Title:       data.Title,
		Description: data.Description,
		Image:       data.Image,
		SiteName:    data.SiteName,
		URL:         rawURL,
	}

	payload, err := json.Marshal(result)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch OGP data"})
		return
	}

	if h.Cache != nil {
		h.Cache.Set(cacheKey, payload, 5*time.Minute)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(payload)
}
