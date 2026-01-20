package notes

import (
	"sort"
	"testing"
)

func TestExtractAllUrls(t *testing.T) {
	content := `Here is [Example](https://example.com/path) and also https://example.com/path?foo=bar, plus https://example.com/path.`
	urls := ExtractAllUrls(content)
	sort.Strings(urls)

	if len(urls) != 2 {
		t.Fatalf("expected 2 urls, got %d: %v", len(urls), urls)
	}

	if urls[0] != "https://example.com/path" {
		t.Fatalf("unexpected url[0]: %q", urls[0])
	}
	if urls[1] != "https://example.com/path?foo=bar" {
		t.Fatalf("unexpected url[1]: %q", urls[1])
	}
}
