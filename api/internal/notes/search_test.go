package notes

import (
	"strings"
	"testing"
)

func TestBuildSearchConditionEmpty(t *testing.T) {
	cond, args := BuildSearchCondition(" ")
	if cond != "" || args != nil {
		t.Fatalf("expected empty condition, got %q with %v", cond, args)
	}
}

func TestBuildSearchConditionIncludesLinkMetadata(t *testing.T) {
	cond, args := BuildSearchCondition(`foo bar`)
	if !strings.Contains(cond, "EXISTS (SELECT 1 FROM NoteLinkMetadata") {
		t.Fatalf("expected link metadata condition, got %q", cond)
	}
	if len(args) != 8 {
		t.Fatalf("expected 8 args, got %d", len(args))
	}
}

func TestBuildSearchConditionPhrase(t *testing.T) {
	cond, args := BuildSearchCondition(`"foo bar"`)
	if cond == "" {
		t.Fatal("expected condition for phrase query")
	}
	if len(args) != 4 {
		t.Fatalf("expected 4 args for phrase query, got %d", len(args))
	}
}
