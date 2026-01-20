package linkmeta

import "testing"

func TestDetectURLType(t *testing.T) {
	tests := []struct {
		url  string
		want string
	}{
		{"https://twitter.com/user/status/123", TypeTwitter},
		{"https://x.com/user/status/456", TypeTwitter},
		{"https://www.youtube.com/watch?v=abc", TypeYouTube},
		{"https://youtu.be/abc", TypeYouTube},
		{"https://example.com", TypeOGP},
	}

	for _, tt := range tests {
		if got := DetectURLType(tt.url); got != tt.want {
			t.Fatalf("DetectURLType(%q) = %q, want %q", tt.url, got, tt.want)
		}
	}
}

func TestExtractTweetID(t *testing.T) {
	id := ExtractTweetID("https://twitter.com/user/status/1234567890")
	if id != "1234567890" {
		t.Fatalf("unexpected tweet id: %q", id)
	}

	id = ExtractTweetID("https://x.com/user/status/42")
	if id != "42" {
		t.Fatalf("unexpected tweet id for x.com: %q", id)
	}

	id = ExtractTweetID("https://example.com")
	if id != "" {
		t.Fatalf("expected empty id, got %q", id)
	}
}
