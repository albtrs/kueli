package tweet

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

var ErrNotFound = errors.New("tweet not found")

type Tweet struct {
	TypeName    string `json:"__typename"`
	ID          string `json:"id_str"`
	Text        string `json:"text"`
	CreatedAt   string `json:"created_at"`
	User        User   `json:"user"`
	Photos      []Photo `json:"photos"`
	MediaDetails []MediaDetail `json:"mediaDetails"`
	Video        *Video        `json:"video"`
	QuotedTweet  *Tweet        `json:"quoted_tweet"`
}

type User struct {
	Name            string `json:"name"`
	ScreenName      string `json:"screen_name"`
	ProfileImageURL string `json:"profile_image_url_https"`
}

type Photo struct {
	URL    string `json:"url"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

type MediaDetail struct {
	MediaURL string `json:"media_url_https"`
	Type     string `json:"type"`
	Original struct {
		Width  int `json:"width"`
		Height int `json:"height"`
	} `json:"original_info"`
}

type Video struct {
	Poster   string    `json:"poster"`
	Variants []Variant `json:"variants"`
}

type Variant struct {
	Type    string `json:"type"`
	Bitrate int    `json:"bitrate"`
	Src     string `json:"src"`
	URL     string `json:"url"`
}

var tweetIDPattern = regexp.MustCompile(`^[0-9]+$`)

func Fetch(ctx context.Context, id string) (Tweet, error) {
	if id == "" || len(id) > 40 || !tweetIDPattern.MatchString(id) {
		return Tweet{}, ErrNotFound
	}

	endpoint, err := buildSyndicationURL(id)
	if err != nil {
		return Tweet{}, err
	}

	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return Tweet{}, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return Tweet{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return Tweet{}, ErrNotFound
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return Tweet{}, errors.New("tweet fetch failed")
	}

	var payload Tweet
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return Tweet{}, err
	}

	if payload.TypeName == "TweetTombstone" {
		return Tweet{}, ErrNotFound
	}

	return payload, nil
}

func ExtractPhotos(tweet Tweet) []Photo {
	if tweet.Video != nil {
		return []Photo{}
	}
	if len(tweet.Photos) > 0 {
		return tweet.Photos
	}
	photos := []Photo{}
	for _, media := range tweet.MediaDetails {
		if media.Type != "photo" {
			continue
		}
		photos = append(photos, Photo{
			URL:    media.MediaURL,
			Width:  media.Original.Width,
			Height: media.Original.Height,
		})
	}
	return photos
}

func ExtractVideo(tweet Tweet) *Video {
	if tweet.Video == nil {
		return nil
	}
	if len(tweet.Video.Variants) == 0 {
		return nil
	}
	variants := make([]Variant, 0, len(tweet.Video.Variants))
	for _, variant := range tweet.Video.Variants {
		if variant.Type == "video/mp4" {
			variants = append(variants, variant)
		}
	}
	if len(variants) == 0 {
		variants = append(variants, tweet.Video.Variants...)
	}
	sort.SliceStable(variants, func(i, j int) bool {
		return variants[i].Bitrate > variants[j].Bitrate
	})
	best := variants[0]
	if best.Src == "" && best.URL == "" {
		return nil
	}
	src := best.Src
	if src == "" {
		src = best.URL
	}
	return &Video{
		Poster: tweet.Video.Poster,
		Variants: []Variant{
			{
				Type:    best.Type,
				Bitrate: best.Bitrate,
				Src:     src,
				URL:     src,
			},
		},
	}
}

func buildSyndicationURL(id string) (string, error) {
	base, err := url.Parse("https://cdn.syndication.twimg.com/tweet-result")
	if err != nil {
		return "", err
	}
	params := url.Values{}
	params.Set("id", id)
	params.Set("lang", "en")
	params.Set("features", strings.Join([]string{
		"tfw_timeline_list:",
		"tfw_follower_count_sunset:true",
		"tfw_tweet_edit_backend:on",
		"tfw_refsrc_session:on",
		"tfw_fosnr_soft_interventions_enabled:on",
		"tfw_show_birdwatch_pivots_enabled:on",
		"tfw_show_business_verified_badge:on",
		"tfw_duplicate_scribes_to_settings:on",
		"tfw_use_profile_image_shape_enabled:on",
		"tfw_show_blue_verified_badge:on",
		"tfw_legacy_timeline_sunset:true",
		"tfw_show_gov_verified_badge:on",
		"tfw_show_business_affiliate_badge:on",
		"tfw_tweet_edit_frontend:on",
	}, ";"))
	params.Set("token", tweetToken(id))
	base.RawQuery = params.Encode()
	return base.String(), nil
}

func tweetToken(id string) string {
	num, err := strconv.ParseFloat(id, 64)
	if err != nil {
		return "0"
	}
	value := (num / 1e15) * math.Pi
	base36 := toBase36Float(value)
	return stripZerosAndDots(base36)
}

func toBase36Float(value float64) string {
	digits := "0123456789abcdefghijklmnopqrstuvwxyz"
	intPart := int64(value)
	frac := value - float64(intPart)
	var builder strings.Builder
	builder.WriteString(toBase36Int(intPart))
	if frac > 0 {
		builder.WriteByte('.')
		for i := 0; i < 12; i++ {
			frac *= 36
			digit := int(frac)
			if digit < 0 {
				digit = 0
			}
			if digit >= len(digits) {
				digit = len(digits) - 1
			}
			builder.WriteByte(digits[digit])
			frac -= float64(digit)
			if frac <= 0 {
				break
			}
		}
	}
	return builder.String()
}

func toBase36Int(value int64) string {
	if value == 0 {
		return "0"
	}
	digits := "0123456789abcdefghijklmnopqrstuvwxyz"
	var out []byte
	for value > 0 {
		rem := value % 36
		out = append(out, digits[rem])
		value /= 36
	}
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return string(out)
}

func stripZerosAndDots(value string) string {
	var builder strings.Builder
	for _, r := range value {
		if r == '0' || r == '.' {
			continue
		}
		builder.WriteRune(r)
	}
	result := builder.String()
	if result == "" {
		return "0"
	}
	return result
}
