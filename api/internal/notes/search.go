package notes

import (
	"regexp"
	"strings"
)

type tokenType int

const (
	tokenInclude tokenType = iota
	tokenExclude
)

type searchToken struct {
	Type     tokenType
	Value    string
	IsPhrase bool
}

type andGroup struct {
	Includes []searchToken
	Excludes []searchToken
}

type parsedQuery struct {
	Groups []andGroup
	Empty  bool
}

func BuildSearchCondition(query string) (string, []any) {
	parsed := parseSearchQuery(query)
	if parsed.Empty {
		return "", nil
	}

	noteCond, noteArgs := buildNoteCondition(parsed)
	linkCond, linkArgs := buildLinkMetadataCondition(parsed)

	if linkCond == "" {
		return noteCond, noteArgs
	}

	combined := "(" + noteCond + " OR EXISTS (SELECT 1 FROM NoteLinkMetadata nlm JOIN LinkMetadata lm ON lm.id = nlm.linkMetadataId WHERE nlm.noteId = Note.id AND " + linkCond + "))"
	return combined, append(noteArgs, linkArgs...)
}

func parseSearchQuery(query string) parsedQuery {
	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return parsedQuery{Empty: true}
	}

	segments := splitByPipe(trimmed)
	groups := make([]andGroup, 0, len(segments))

	for _, segment := range segments {
		group := tokenizeSegment(segment)
		if len(group.Includes) == 0 && len(group.Excludes) == 0 {
			continue
		}
		groups = append(groups, group)
	}

	if len(groups) == 0 {
		return parsedQuery{Empty: true}
	}

	return parsedQuery{Groups: groups}
}

func splitByPipe(input string) []string {
	segments := []string{}
	var current strings.Builder
	inQuote := false

	for _, char := range input {
		switch char {
		case '"':
			inQuote = !inQuote
			current.WriteRune(char)
		case '|':
			if inQuote {
				current.WriteRune(char)
				continue
			}
			segment := strings.TrimSpace(current.String())
			if segment != "" {
				segments = append(segments, segment)
			}
			current.Reset()
		default:
			current.WriteRune(char)
		}
	}

	if value := strings.TrimSpace(current.String()); value != "" {
		segments = append(segments, value)
	}

	return segments
}

var tokenRegex = regexp.MustCompile(`(-?"[^"]*")|(-?\S+)`)

func tokenizeSegment(segment string) andGroup {
	matches := tokenRegex.FindAllString(segment, -1)
	group := andGroup{}
	for _, raw := range matches {
		token := parseToken(raw)
		if token.Value == "" {
			continue
		}
		if token.Type == tokenExclude {
			group.Excludes = append(group.Excludes, token)
		} else {
			group.Includes = append(group.Includes, token)
		}
	}
	return group
}

func parseToken(raw string) searchToken {
	value := raw
	token := searchToken{Type: tokenInclude}

	if strings.HasPrefix(value, "-") {
		token.Type = tokenExclude
		value = strings.TrimPrefix(value, "-")
	}

	if strings.HasPrefix(value, "\"") && strings.HasSuffix(value, "\"") && len(value) >= 2 {
		token.IsPhrase = true
		value = strings.TrimSuffix(strings.TrimPrefix(value, "\""), "\"")
	}

	token.Value = strings.TrimSpace(value)
	return token
}

func buildNoteCondition(parsed parsedQuery) (string, []any) {
	parts := []string{}
	args := []any{}

	for _, group := range parsed.Groups {
		groupParts := []string{}
		for _, token := range group.Includes {
			fragment, fragArgs := buildTokenCondition(token, false)
			groupParts = append(groupParts, fragment)
			args = append(args, fragArgs...)
		}
		for _, token := range group.Excludes {
			fragment, fragArgs := buildTokenCondition(token, true)
			groupParts = append(groupParts, fragment)
			args = append(args, fragArgs...)
		}
		if len(groupParts) > 0 {
			parts = append(parts, "("+strings.Join(groupParts, " AND ")+")")
		}
	}

	return strings.Join(parts, " OR "), args
}

func buildTokenCondition(token searchToken, negate bool) (string, []any) {
	searchValue := "%" + token.Value + "%"
	tagsValue := "%\"" + token.Value + "\"%"

	base := "(title LIKE ? OR content LIKE ? OR tags LIKE ?)"
	args := []any{searchValue, searchValue, tagsValue}

	if negate {
		return "NOT " + base, args
	}
	return base, args
}

func buildLinkMetadataCondition(parsed parsedQuery) (string, []any) {
	parts := []string{}
	args := []any{}

	for _, group := range parsed.Groups {
		groupParts := []string{}
		for _, token := range group.Includes {
			groupParts = append(groupParts, "lm.searchText LIKE ?")
			args = append(args, "%"+token.Value+"%")
		}
		for _, token := range group.Excludes {
			groupParts = append(groupParts, "NOT (lm.searchText LIKE ?)")
			args = append(args, "%"+token.Value+"%")
		}
		if len(groupParts) > 0 {
			parts = append(parts, "("+strings.Join(groupParts, " AND ")+")")
		}
	}

	return strings.Join(parts, " OR "), args
}
