package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"kueli-api/internal/cache"
	"kueli-api/internal/httpx"
	"kueli-api/internal/tweet"
)

type TweetHandler struct {
	Cache *cache.Cache
}

type tweetUser struct {
	Name            string `json:"name"`
	ScreenName      string `json:"screenName"`
	ProfileImageURL string `json:"profileImageUrl"`
}

type tweetPhoto struct {
	URL    string `json:"url"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

type tweetVideo struct {
	URL    string `json:"url"`
	Poster string `json:"poster"`
}

type quotedTweetData struct {
	ID     string      `json:"id"`
	Text   string      `json:"text"`
	User   tweetUser   `json:"user"`
	Photos []tweetPhoto `json:"photos"`
	Video  *tweetVideo `json:"video,omitempty"`
}

type tweetResponse struct {
	ID         string           `json:"id"`
	Text       string           `json:"text"`
	User       tweetUser        `json:"user"`
	Photos     []tweetPhoto     `json:"photos"`
	Video      *tweetVideo      `json:"video,omitempty"`
	QuotedTweet *quotedTweetData `json:"quotedTweet,omitempty"`
	CreatedAt  string           `json:"createdAt"`
}

func (h *TweetHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Tweet ID is required"})
		return
	}

	cacheKey := "tweet:" + id
	if h.Cache != nil {
		if data, ok := h.Cache.Get(cacheKey); ok {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(data)
			return
		}
	}

	payload, err := tweet.Fetch(r.Context(), id)
	if err != nil {
		if err == tweet.ErrNotFound {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "Tweet not found"})
			return
		}
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch tweet"})
		return
	}

	response := mapTweet(payload)
	encoded, err := json.Marshal(response)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch tweet"})
		return
	}

	if h.Cache != nil {
		h.Cache.Set(cacheKey, encoded, 10*time.Minute)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(encoded)
}

func mapTweet(source tweet.Tweet) tweetResponse {
	user := tweetUser{
		Name:            source.User.Name,
		ScreenName:      source.User.ScreenName,
		ProfileImageURL: source.User.ProfileImageURL,
	}

	photos, video := extractMedia(source)
	response := tweetResponse{
		ID:        source.ID,
		Text:      source.Text,
		User:      user,
		Photos:    photos,
		Video:     video,
		CreatedAt: source.CreatedAt,
	}

	if source.QuotedTweet != nil {
		qt := source.QuotedTweet
		qtPhotos, qtVideo := extractMedia(*qt)
		response.QuotedTweet = &quotedTweetData{
			ID:   qt.ID,
			Text: qt.Text,
			User: tweetUser{
				Name:            qt.User.Name,
				ScreenName:      qt.User.ScreenName,
				ProfileImageURL: qt.User.ProfileImageURL,
			},
			Photos: qtPhotos,
			Video:  qtVideo,
		}
	}

	return response
}

func extractMedia(source tweet.Tweet) ([]tweetPhoto, *tweetVideo) {
	photos := tweet.ExtractPhotos(source)
	video := tweet.ExtractVideo(source)

	if video != nil {
		return []tweetPhoto{}, &tweetVideo{
			URL:    pickVideoSource(video),
			Poster: video.Poster,
		}
	}

	output := make([]tweetPhoto, 0, len(photos))
	for _, photo := range photos {
		output = append(output, tweetPhoto{
			URL:    photo.URL,
			Width:  photo.Width,
			Height: photo.Height,
		})
	}
	return output, nil
}

func pickVideoSource(video *tweet.Video) string {
	if video == nil || len(video.Variants) == 0 {
		return ""
	}
	best := video.Variants[0]
	if best.Src != "" {
		return best.Src
	}
	return best.URL
}
