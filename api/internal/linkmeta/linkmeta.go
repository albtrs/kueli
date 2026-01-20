package linkmeta

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"

	"kueli-api/internal/ogp"
	"kueli-api/internal/security"
	"kueli-api/internal/tweet"
)

const (
	TypeTwitter = "twitter"
	TypeYouTube = "youtube"
	TypeOGP     = "ogp"
)

type storedTweetData struct {
	ID             string `json:"id"`
	Text           string `json:"text"`
	UserName       string `json:"userName"`
	UserScreenName string `json:"userScreenName"`
	QuotedText     string `json:"quotedText,omitempty"`
	CreatedAt      string `json:"createdAt"`
}

type metadataUpdate struct {
	Type        string
	Title       string
	Description string
	Image       string
	SiteName    string
	TweetData   string
	SearchText  string
}

var tweetURLPattern = regexp.MustCompile(`(?i)(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)`)

func DetectURLType(rawURL string) string {
	lower := strings.ToLower(rawURL)
	if strings.Contains(lower, "twitter.com") || strings.Contains(lower, "x.com") {
		return TypeTwitter
	}
	if strings.Contains(lower, "youtube.com") || strings.Contains(lower, "youtu.be") {
		return TypeYouTube
	}
	return TypeOGP
}

func ExtractTweetID(rawURL string) string {
	match := tweetURLPattern.FindStringSubmatch(rawURL)
	if len(match) > 1 {
		return match[1]
	}
	return ""
}

func FetchAndSave(ctx context.Context, db *sql.DB, rawURL string) error {
	validation := security.IsValidExternalURL(rawURL)
	if !validation.Valid {
		if err := updateError(ctx, db, rawURL, validation.Reason); err != nil {
			return err
		}
		return nil
	}

	urlType := DetectURLType(rawURL)
	update, err := fetchMetadata(ctx, rawURL, urlType)
	if err != nil {
		if err := updateError(ctx, db, rawURL, err.Error()); err != nil {
			return err
		}
		return err
	}

	nowMillis := time.Now().UnixMilli()
	_, err = db.ExecContext(ctx, `
UPDATE LinkMetadata
SET type = ?,
    title = ?,
    description = ?,
    image = ?,
    siteName = ?,
    tweetData = ?,
    searchText = ?,
    fetchedAt = ?,
    errorAt = NULL,
    errorReason = NULL,
    updatedAt = ?
WHERE url = ?
`, update.Type,
		nullIfEmpty(update.Title),
		nullIfEmpty(update.Description),
		nullIfEmpty(update.Image),
		nullIfEmpty(update.SiteName),
		nullIfEmpty(update.TweetData),
		update.SearchText,
		nowMillis,
		nowMillis,
		rawURL,
	)
	return err
}

func fetchMetadata(ctx context.Context, rawURL, urlType string) (metadataUpdate, error) {
	if urlType == TypeTwitter {
		return fetchTwitter(ctx, rawURL)
	}
	ogpData, err := ogp.Fetch(rawURL)
	if err != nil {
		return metadataUpdate{}, err
	}
	searchText := buildSearchText(ogpData.Title, ogpData.Description, ogpData.SiteName)
	return metadataUpdate{
		Type:        urlType,
		Title:       ogpData.Title,
		Description: ogpData.Description,
		Image:       ogpData.Image,
		SiteName:    ogpData.SiteName,
		SearchText:  searchText,
	}, nil
}

func fetchTwitter(ctx context.Context, rawURL string) (metadataUpdate, error) {
	tweetID := ExtractTweetID(rawURL)
	if tweetID == "" {
		return metadataUpdate{}, errors.New("Invalid Twitter URL")
	}

	tw, err := tweet.Fetch(ctx, tweetID)
	if err != nil {
		if errors.Is(err, tweet.ErrNotFound) {
			return metadataUpdate{}, errors.New("Tweet not found")
		}
		return metadataUpdate{}, err
	}

	stored := storedTweetData{
		ID:             tw.ID,
		Text:           tw.Text,
		UserName:       tw.User.Name,
		UserScreenName: tw.User.ScreenName,
		CreatedAt:      tw.CreatedAt,
	}
	if tw.QuotedTweet != nil {
		stored.QuotedText = tw.QuotedTweet.Text
	}

	encoded, err := json.Marshal(stored)
	if err != nil {
		return metadataUpdate{}, err
	}

	title := strings.TrimSpace(stored.UserName)
	if stored.UserScreenName != "" {
		if title == "" {
			title = "@" + stored.UserScreenName
		} else {
			title = title + " (@" + stored.UserScreenName + ")"
		}
	}

	searchText := buildSearchText(stored.Text, stored.UserName, stored.UserScreenName, stored.QuotedText)

	return metadataUpdate{
		Type:        TypeTwitter,
		Title:       title,
		Description: truncateRunes(stored.Text, 200),
		TweetData:   string(encoded),
		SearchText:  searchText,
	}, nil
}

func buildSearchText(values ...string) string {
	parts := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		parts = append(parts, value)
	}
	return strings.Join(parts, " ")
}

func truncateRunes(value string, limit int) string {
	if limit <= 0 || value == "" {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit])
}

func nullIfEmpty(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func updateError(ctx context.Context, db *sql.DB, rawURL, reason string) error {
	if reason == "" {
		reason = "Unknown error"
	}
	nowMillis := time.Now().UnixMilli()
	_, err := db.ExecContext(ctx, `
UPDATE LinkMetadata
SET errorAt = ?,
    errorReason = ?,
    updatedAt = ?
WHERE url = ?
`, nowMillis, reason, nowMillis, rawURL)
	return err
}
