package ogp

import (
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"kueli-api/internal/security"
)

type Data struct {
	Title       string
	Description string
	Image       string
	SiteName    string
}

type Error struct {
	Message string
}

func (e Error) Error() string { return e.Message }

func ErrInvalidURL(reason string) error {
	if reason == "" {
		reason = "Invalid URL"
	}
	return Error{Message: reason}
}

var ErrFetchFailed = Error{Message: "Failed to fetch URL"}

var (
	metaTitlePattern = regexp.MustCompile(`(?i)<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']`)
	metaTitleAlt     = regexp.MustCompile(`(?i)<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']`)
	titleTagPattern  = regexp.MustCompile(`(?i)<title[^>]*>([^<]+)</title>`)

	metaDescPattern       = regexp.MustCompile(`(?i)<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']`)
	metaDescAlt           = regexp.MustCompile(`(?i)<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']`)
	metaDescFallback      = regexp.MustCompile(`(?i)<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']`)
	metaDescFallbackAlt   = regexp.MustCompile(`(?i)<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']`)
	metaImagePattern      = regexp.MustCompile(`(?i)<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']`)
	metaImageAlt          = regexp.MustCompile(`(?i)<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']`)
	metaSitePattern       = regexp.MustCompile(`(?i)<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']`)
	metaSiteAlt           = regexp.MustCompile(`(?i)<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:site_name["']`)
)

func Fetch(rawURL string) (Data, error) {
	validation := security.IsValidExternalURL(rawURL)
	if !validation.Valid {
		return Data{}, ErrInvalidURL(validation.Reason)
	}

	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return Data{}, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; OGPBot/1.0)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")

	resp, err := client.Do(req)
	if err != nil {
		return Data{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return Data{}, ErrFetchFailed
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return Data{}, err
	}
	html := string(body)

	data := Data{}
	if match := firstMatch(html, metaTitlePattern, metaTitleAlt); match != "" {
		data.Title = decodeHTMLEntities(match)
	} else if match := titleTagPattern.FindStringSubmatch(html); len(match) > 1 {
		data.Title = decodeHTMLEntities(match[1])
	}

	if match := firstMatch(html, metaDescPattern, metaDescAlt); match != "" {
		data.Description = decodeHTMLEntities(match)
	} else if match := firstMatch(html, metaDescFallback, metaDescFallbackAlt); match != "" {
		data.Description = decodeHTMLEntities(match)
	}

	if match := firstMatch(html, metaImagePattern, metaImageAlt); match != "" {
		if strings.HasPrefix(match, "/") {
			if parsed, err := url.Parse(rawURL); err == nil {
				match = parsed.Scheme + "://" + parsed.Host + match
			}
		}
		data.Image = match
	}

	if match := firstMatch(html, metaSitePattern, metaSiteAlt); match != "" {
		data.SiteName = decodeHTMLEntities(match)
	}

	return data, nil
}

func firstMatch(html string, patterns ...*regexp.Regexp) string {
	for _, pattern := range patterns {
		match := pattern.FindStringSubmatch(html)
		if len(match) > 1 {
			return match[1]
		}
	}
	return ""
}

func decodeHTMLEntities(text string) string {
	replacer := strings.NewReplacer(
		"&amp;", "&",
		"&lt;", "<",
		"&gt;", ">",
		"&quot;", "\"",
		"&#39;", "'",
		"&#x27;", "'",
		"&#x2F;", "/",
		"&nbsp;", " ",
	)
	return replacer.Replace(text)
}
