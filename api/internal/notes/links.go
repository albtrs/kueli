package notes

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"regexp"
	"strings"
	"time"

	"kueli-api/internal/linkmeta"

	"github.com/lucsky/cuid"
)

func Backlinks(ctx context.Context, db *sql.DB, noteID string) ([]Note, error) {
	row := db.QueryRowContext(ctx, `SELECT title FROM Note WHERE id = ?`, noteID)
	var title string
	if err := row.Scan(&title); err != nil {
		return nil, err
	}

	title = strings.TrimSpace(title)
	if title == "" {
		return []Note{}, nil
	}

	rows, err := db.QueryContext(ctx, `
SELECT id, title, content, tags, images, isPinned, isArchived, createdAt, updatedAt
FROM Note
WHERE id != ? AND isArchived = 0 AND content LIKE ?
ORDER BY updatedAt DESC
`, noteID, "%[["+title+"%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	re := regexp.MustCompile(`\[\[` + regexp.QuoteMeta(title) + `(\|[^\]]+)?\]\]`)
	results := []Note{}

	for rows.Next() {
		note, err := scanNote(rows)
		if err != nil {
			return nil, err
		}
		if re.MatchString(note.Content) {
			results = append(results, note)
		}
	}

	return results, rows.Err()
}

func updateWikiLinksOnTitleChange(ctx context.Context, db *sql.DB, noteID, oldTitle, newTitle string) error {
	oldTitle = strings.TrimSpace(oldTitle)
	newTitle = strings.TrimSpace(newTitle)
	if oldTitle == "" || newTitle == "" || oldTitle == newTitle {
		return nil
	}

	rows, err := db.QueryContext(ctx, `
SELECT id, content
FROM Note
WHERE id != ? AND content LIKE ?
`, noteID, "%[["+oldTitle+"%")
	if err != nil {
		return err
	}
	defer rows.Close()

	re := regexp.MustCompile(`\[\[` + regexp.QuoteMeta(oldTitle) + `(\|[^\]]+)?\]\]`)
	type update struct {
		ID      string
		Content string
	}
	updates := []update{}

	for rows.Next() {
		var id string
		var content string
		if err := rows.Scan(&id, &content); err != nil {
			return err
		}
		if !re.MatchString(content) {
			continue
		}
		replaced := re.ReplaceAllStringFunc(content, func(match string) string {
			if strings.Contains(match, "|") {
				parts := strings.SplitN(match[2:len(match)-2], "|", 2)
				if len(parts) == 2 {
					return "[[" + newTitle + "|" + parts[1] + "]]"
				}
			}
			return "[[" + newTitle + "]]"
		})
		if replaced != content {
			updates = append(updates, update{ID: id, Content: replaced})
		}
	}

	if len(updates) == 0 {
		return nil
	}

	for _, item := range updates {
		if _, err := db.ExecContext(ctx, `UPDATE Note SET content = ? WHERE id = ?`, item.Content, item.ID); err != nil {
			return err
		}
	}

	return nil
}

func processNoteLinks(ctx context.Context, db *sql.DB, noteID, content string) error {
	urls := ExtractAllUrls(content)

	rows, err := db.QueryContext(ctx, `
SELECT nlm.linkMetadataId, lm.url, lm.fetchedAt, lm.errorAt
FROM NoteLinkMetadata nlm
JOIN LinkMetadata lm ON lm.id = nlm.linkMetadataId
WHERE nlm.noteId = ?
`, noteID)
	if err != nil {
		return err
	}
	defer rows.Close()

	type existingLink struct {
		ID        string
		FetchedAt any
		ErrorAt   any
	}
	existing := map[string]existingLink{}
	for rows.Next() {
		var linkID, url string
		var fetchedAt any
		var errorAt any
		if err := rows.Scan(&linkID, &url, &fetchedAt, &errorAt); err != nil {
			return err
		}
		existing[url] = existingLink{ID: linkID, FetchedAt: fetchedAt, ErrorAt: errorAt}
	}

	newSet := map[string]struct{}{}
	for _, url := range urls {
		newSet[url] = struct{}{}
	}

	toRemove := []string{}
	for url, link := range existing {
		if _, ok := newSet[url]; !ok {
			toRemove = append(toRemove, link.ID)
		}
	}

	if len(toRemove) > 0 {
		query := `DELETE FROM NoteLinkMetadata WHERE noteId = ? AND linkMetadataId IN (` + strings.Repeat("?,", len(toRemove)-1) + `?)`
		args := []any{noteID}
		for _, id := range toRemove {
			args = append(args, id)
		}
		if _, err := db.ExecContext(ctx, query, args...); err != nil {
			return err
		}
	}

	toFetch := []string{}

	for _, url := range urls {
		linkID := ""
		var fetchedAt any
		var errorAt any
		shouldFetch := false

		if existingLink, ok := existing[url]; ok {
			linkID = existingLink.ID
			fetchedAt = existingLink.FetchedAt
			errorAt = existingLink.ErrorAt
		} else {
			row := db.QueryRowContext(ctx, `SELECT id, fetchedAt, errorAt FROM LinkMetadata WHERE url = ?`, url)
			if err := row.Scan(&linkID, &fetchedAt, &errorAt); err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					linkID = cuid.New()
					linkType := linkmeta.DetectURLType(url)
					nowMillis := time.Now().UnixMilli()
					_, err := db.ExecContext(ctx, `
INSERT INTO LinkMetadata (id, url, type, searchText, createdAt, updatedAt)
VALUES (?, ?, ?, '', ?, ?)
`, linkID, url, linkType, nowMillis, nowMillis)
					if err != nil {
						return err
					}
					shouldFetch = true
				} else {
					return err
				}
			}
		}

		if !shouldFetch {
			hasFetched := false
			if _, ok := timeValueToMillis(fetchedAt); ok {
				hasFetched = true
			}
			hasError := false
			if _, ok := timeValueToMillis(errorAt); ok {
				hasError = true
			}
			if !hasFetched && !hasError {
				shouldFetch = true
			}
		}

		if _, err := db.ExecContext(ctx, `
INSERT OR IGNORE INTO NoteLinkMetadata (noteId, linkMetadataId)
VALUES (?, ?)
`, noteID, linkID); err != nil {
			return err
		}

		if shouldFetch {
			toFetch = append(toFetch, url)
		}
	}

	for _, url := range toFetch {
		url := url
		go func() {
			fetchCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			if err := linkmeta.FetchAndSave(fetchCtx, db, url); err != nil {
				log.Printf("link metadata fetch failed for %s: %v", url, err)
			}
		}()
	}

	return nil
}
