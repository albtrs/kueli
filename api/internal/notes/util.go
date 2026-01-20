package notes

import (
	"encoding/json"
	"net/url"
	"regexp"
	"strings"
)

var tagRegex = regexp.MustCompile(`#([^\s#]+)`)

func ExtractTagsFromContent(content string) string {
	matches := tagRegex.FindAllStringSubmatch(content, -1)
	if len(matches) == 0 {
		return "[]"
	}
	unique := make(map[string]struct{})
	tags := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		tag := match[1]
		if _, exists := unique[tag]; exists {
			continue
		}
		unique[tag] = struct{}{}
		tags = append(tags, tag)
	}
	data, _ := json.Marshal(tags)
	return string(data)
}

func ParseJSONList(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{}
	}
	var result []string
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		return []string{}
	}
	return result
}

func EncodeJSONList(values []string) string {
	if values == nil {
		values = []string{}
	}
	data, _ := json.Marshal(values)
	return string(data)
}

func ExtractAllUrls(content string) []string {
	urls := make(map[string]struct{})

	markdownPattern := regexp.MustCompile(`\[[^\]]*\]\((https?://[^)]+)\)`)
	for _, match := range markdownPattern.FindAllStringSubmatch(content, -1) {
		if len(match) < 2 {
			continue
		}
		if normalized := normalizeURL(match[1]); normalized != "" {
			urls[normalized] = struct{}{}
		}
	}

	plainPattern := regexp.MustCompile(`https?://[^\s<>\[\]()]+`)
	for _, match := range plainPattern.FindAllString(content, -1) {
		if normalized := normalizeURL(match); normalized != "" {
			urls[normalized] = struct{}{}
		}
	}

	result := make([]string, 0, len(urls))
	for value := range urls {
		result = append(result, value)
	}
	return result
}

func normalizeURL(raw string) string {
	raw = strings.TrimRight(raw, ".,;:!?")
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return parsed.String()
}
