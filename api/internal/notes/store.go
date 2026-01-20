package notes

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"

	"kueli-api/internal/linkmeta"

	"github.com/lucsky/cuid"
)

const (
	versionInterval = 30 * time.Minute
	maxVersions     = 20
)

func List(ctx context.Context, db *sql.DB, opts ListOptions) ([]Note, string, bool, error) {
	limit := opts.Limit
	if limit <= 0 {
		limit = 20
	}

	whereParts := []string{"1=1"}
	args := []any{}

	if !opts.IncludeArchived {
		whereParts = append(whereParts, "isArchived = 0")
	}

	if opts.ExcludePinned {
		whereParts = append(whereParts, "isPinned = 0")
	}

	if opts.Tag != "" {
		if opts.Tag == "__untagged__" {
			whereParts = append(whereParts, "tags = '[]'")
		} else {
			whereParts = append(whereParts, "tags LIKE ?")
			args = append(args, "%\""+opts.Tag+"\"%")
		}
	}

	if strings.TrimSpace(opts.Search) != "" {
		searchCond, searchArgs := BuildSearchCondition(opts.Search)
		if searchCond != "" {
			whereParts = append(whereParts, "("+searchCond+")")
			args = append(args, searchArgs...)
		}
	}

	sortOrder := "DESC"
	if strings.ToLower(opts.SortOrder) == "asc" {
		sortOrder = "ASC"
	}

	if opts.Cursor != "" {
		var cursorUpdatedAt any
		err := db.QueryRowContext(ctx, "SELECT updatedAt FROM Note WHERE id = ?", opts.Cursor).Scan(&cursorUpdatedAt)
		if err == nil {
			cursorMillis, ok := timeValueToMillis(cursorUpdatedAt)
			if !ok {
				cursorMillis = time.Now().UnixMilli()
			}
			if sortOrder == "DESC" {
				whereParts = append(whereParts, "(updatedAt < ? OR (updatedAt = ? AND id < ?))")
				args = append(args, cursorMillis, cursorMillis, opts.Cursor)
			} else {
				whereParts = append(whereParts, "(updatedAt > ? OR (updatedAt = ? AND id > ?))")
				args = append(args, cursorMillis, cursorMillis, opts.Cursor)
			}
		}
	}

	query := fmt.Sprintf(`
SELECT id, title, content, tags, images, isPinned, isArchived, createdAt, updatedAt
FROM Note
WHERE %s
ORDER BY updatedAt %s, id %s
LIMIT ?
`, strings.Join(whereParts, " AND "), sortOrder, sortOrder)

	args = append(args, limit+1)

	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, "", false, err
	}
	defer rows.Close()

	notes := []Note{}
	for rows.Next() {
		note, err := scanNote(rows)
		if err != nil {
			return nil, "", false, err
		}
		notes = append(notes, note)
	}

	if err := rows.Err(); err != nil {
		return nil, "", false, err
	}

	hasMore := len(notes) > limit
	if hasMore {
		notes = notes[:limit]
	}

	nextCursor := ""
	if hasMore && len(notes) > 0 {
		nextCursor = notes[len(notes)-1].ID
	}

	return notes, nextCursor, hasMore, nil
}

func Get(ctx context.Context, db *sql.DB, id string) (Note, error) {
	row := db.QueryRowContext(ctx, `
SELECT id, title, content, tags, images, isPinned, isArchived, createdAt, updatedAt
FROM Note
WHERE id = ?
`, id)

	return scanNoteRow(row)
}

func Create(ctx context.Context, db *sql.DB, payload NotePayload) (Note, error) {
	title := "無題のメモ"
	if payload.Title != nil && strings.TrimSpace(*payload.Title) != "" {
		title = *payload.Title
	}

	content := ""
	if payload.Content != nil {
		content = *payload.Content
	}

	isPinned := false
	if payload.IsPinned != nil {
		isPinned = *payload.IsPinned
	}

	tags := "[]"
	if payload.Tags != nil {
		tags = EncodeJSONList(*payload.Tags)
	}

	images := "[]"
	if payload.Images != nil {
		images = EncodeJSONList(*payload.Images)
	}

	noteID := cuid.New()
	nowMillis := time.Now().UnixMilli()

	_, err := db.ExecContext(ctx, `
INSERT INTO Note (id, title, content, tags, images, isPinned, isArchived, createdAt, updatedAt)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`, noteID, title, content, tags, images, isPinned, false, nowMillis, nowMillis)
	if err != nil {
		return Note{}, err
	}

	note, err := Get(ctx, db, noteID)
	if err != nil {
		return Note{}, err
	}

	_ = processNoteLinks(ctx, db, note.ID, note.Content)
	return note, nil
}

func Update(ctx context.Context, db *sql.DB, id string, payload NotePayload) (Note, error) {
	existing, err := Get(ctx, db, id)
	if err != nil {
		return Note{}, err
	}

	title := existing.Title
	if payload.Title != nil {
		if strings.TrimSpace(*payload.Title) == "" {
			title = "無題のメモ"
		} else {
			title = *payload.Title
		}
	}

	content := existing.Content
	if payload.Content != nil {
		content = *payload.Content
	}

	isPinned := existing.IsPinned
	if payload.IsPinned != nil {
		isPinned = *payload.IsPinned
	}

	isArchived := existing.IsArchived
	if payload.IsArchived != nil {
		isArchived = *payload.IsArchived
	}

	tags := EncodeJSONList(existing.Tags)
	if payload.Tags != nil {
		tags = EncodeJSONList(*payload.Tags)
	}

	images := EncodeJSONList(existing.Images)
	if payload.Images != nil {
		images = EncodeJSONList(*payload.Images)
	}

	nowMillis := time.Now().UnixMilli()

	err = withTx(ctx, db, func(tx *sql.Tx) error {
		if err := maybeCreateVersion(ctx, tx, existing); err != nil {
			return err
		}

		_, err := tx.ExecContext(ctx, `
UPDATE Note
SET title = ?, content = ?, tags = ?, images = ?, isPinned = ?, isArchived = ?, updatedAt = ?
WHERE id = ?
`, title, content, tags, images, isPinned, isArchived, nowMillis, id)
		if err != nil {
			return err
		}

		return nil
	})
	if err != nil {
		return Note{}, err
	}

	if existing.Title != title {
		_ = updateWikiLinksOnTitleChange(ctx, db, id, existing.Title, title)
	}

	note, err := Get(ctx, db, id)
	if err != nil {
		return Note{}, err
	}

	_ = processNoteLinks(ctx, db, note.ID, note.Content)
	return note, nil
}

func Delete(ctx context.Context, db *sql.DB, id string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM Note WHERE id = ?`, id)
	return err
}

func TogglePin(ctx context.Context, db *sql.DB, id string) (Note, error) {
	note, err := Get(ctx, db, id)
	if err != nil {
		return Note{}, err
	}

	_, err = db.ExecContext(ctx, `UPDATE Note SET isPinned = ?, updatedAt = ? WHERE id = ?`,
		!note.IsPinned, time.Now().UnixMilli(), id)
	if err != nil {
		return Note{}, err
	}

	return Get(ctx, db, id)
}

func ToggleArchive(ctx context.Context, db *sql.DB, id string) (Note, error) {
	note, err := Get(ctx, db, id)
	if err != nil {
		return Note{}, err
	}

	newArchived := !note.IsArchived
	newPinned := note.IsPinned
	if newArchived {
		newPinned = false
	}

	_, err = db.ExecContext(ctx, `UPDATE Note SET isArchived = ?, isPinned = ?, updatedAt = ? WHERE id = ?`,
		newArchived, newPinned, time.Now().UnixMilli(), id)
	if err != nil {
		return Note{}, err
	}

	return Get(ctx, db, id)
}

func Duplicate(ctx context.Context, db *sql.DB, id string) (Note, error) {
	original, err := Get(ctx, db, id)
	if err != nil {
		return Note{}, err
	}

	noteID := cuid.New()
	nowMillis := time.Now().UnixMilli()

	_, err = db.ExecContext(ctx, `
INSERT INTO Note (id, title, content, tags, images, isPinned, isArchived, createdAt, updatedAt)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`, noteID, original.Title+"_Copy", original.Content, EncodeJSONList(original.Tags), EncodeJSONList(original.Images), false, false, nowMillis, nowMillis)
	if err != nil {
		return Note{}, err
	}

	return Get(ctx, db, noteID)
}

func ListVersions(ctx context.Context, db *sql.DB, noteID string) ([]NoteVersion, error) {
	rows, err := db.QueryContext(ctx, `
SELECT id, title, content, tags, createdAt, noteId
FROM NoteVersion
WHERE noteId = ?
ORDER BY createdAt DESC
`, noteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	versions := []NoteVersion{}
	for rows.Next() {
		version, err := scanNoteVersion(rows)
		if err != nil {
			return nil, err
		}
		versions = append(versions, version)
	}
	return versions, rows.Err()
}

func GetVersion(ctx context.Context, db *sql.DB, versionID string) (NoteVersion, error) {
	row := db.QueryRowContext(ctx, `
SELECT id, title, content, tags, createdAt, noteId
FROM NoteVersion
WHERE id = ?
`, versionID)

	return scanNoteVersionRow(row)
}

func RestoreVersion(ctx context.Context, db *sql.DB, versionID string) (Note, error) {
	version, err := GetVersion(ctx, db, versionID)
	if err != nil {
		return Note{}, err
	}

	current, err := Get(ctx, db, version.NoteID)
	if err != nil {
		return Note{}, err
	}

	restoredTags := version.Tags
	if strings.TrimSpace(restoredTags) == "" || restoredTags == "[]" {
		restoredTags = ExtractTagsFromContent(version.Content)
	}

	nowMillis := time.Now().UnixMilli()

	err = withTx(ctx, db, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `
INSERT INTO NoteVersion (id, title, content, tags, createdAt, noteId)
VALUES (?, ?, ?, ?, ?, ?)
`, cuid.New(), current.Title, current.Content, EncodeJSONList(current.Tags), nowMillis, current.ID)
		if err != nil {
			return err
		}

		_, err = tx.ExecContext(ctx, `
UPDATE Note
SET title = ?, content = ?, tags = ?, updatedAt = ?
WHERE id = ?
`, version.Title, version.Content, restoredTags, nowMillis, current.ID)
		return err
	})
	if err != nil {
		return Note{}, err
	}

	return Get(ctx, db, current.ID)
}

func DeleteVersion(ctx context.Context, db *sql.DB, versionID string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM NoteVersion WHERE id = ?`, versionID)
	return err
}

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

func maybeCreateVersion(ctx context.Context, tx *sql.Tx, note Note) error {
	if strings.TrimSpace(note.Title) == "" && strings.TrimSpace(note.Content) == "" {
		return nil
	}

	row := tx.QueryRowContext(ctx, `
SELECT createdAt
FROM NoteVersion
WHERE noteId = ?
ORDER BY createdAt DESC
LIMIT 1
`, note.ID)

	var lastCreated any
	if err := row.Scan(&lastCreated); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	} else if err == nil {
		lastTime := parseTimeValue(lastCreated)
		if time.Since(lastTime) <= versionInterval {
			return nil
		}
	}

	nowMillis := time.Now().UnixMilli()

	_, err := tx.ExecContext(ctx, `
INSERT INTO NoteVersion (id, title, content, tags, createdAt, noteId)
VALUES (?, ?, ?, ?, ?, ?)
`, cuid.New(), note.Title, note.Content, EncodeJSONList(note.Tags), nowMillis, note.ID)
	if err != nil {
		return err
	}

	var count int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(1) FROM NoteVersion WHERE noteId = ?`, note.ID).Scan(&count); err != nil {
		return err
	}
	if count > maxVersions {
		_, err := tx.ExecContext(ctx, `
DELETE FROM NoteVersion
WHERE id = (
  SELECT id FROM NoteVersion WHERE noteId = ? ORDER BY createdAt ASC LIMIT 1
)
`, note.ID)
		if err != nil {
			return err
		}
	}

	return nil
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

	re := regexp.MustCompile(`\\[\\[` + regexp.QuoteMeta(oldTitle) + `(\\|[^\\]]+)?\\]\\]`)
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

type noteScanner interface {
	Scan(dest ...any) error
}

func scanNoteRow(row noteScanner) (Note, error) {
	var note Note
	var tags string
	var images string
	var createdAt any
	var updatedAt any

	if err := row.Scan(&note.ID, &note.Title, &note.Content, &tags, &images, &note.IsPinned, &note.IsArchived, &createdAt, &updatedAt); err != nil {
		return Note{}, err
	}

	parsedCreated := parseTimeValue(createdAt)
	parsedUpdated := parseTimeValue(updatedAt)

	note.CreatedAt = parsedCreated
	note.UpdatedAt = parsedUpdated
	note.Tags = ParseJSONList(tags)
	note.Images = ParseJSONList(images)

	return note, nil
}

func scanNote(rows *sql.Rows) (Note, error) {
	return scanNoteRow(rows)
}

func scanNoteVersionRow(row noteScanner) (NoteVersion, error) {
	var version NoteVersion
	var createdAt any

	if err := row.Scan(&version.ID, &version.Title, &version.Content, &version.Tags, &createdAt, &version.NoteID); err != nil {
		return NoteVersion{}, err
	}

	version.CreatedAt = parseTimeValue(createdAt)
	return version, nil
}

func scanNoteVersion(rows *sql.Rows) (NoteVersion, error) {
	return scanNoteVersionRow(rows)
}

func withTx(ctx context.Context, db *sql.DB, fn func(*sql.Tx) error) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

func parseTimeValue(value any) time.Time {
	if millis, ok := timeValueToMillis(value); ok {
		return time.UnixMilli(millis).UTC()
	}
	return time.Now().UTC()
}

func timeValueToMillis(value any) (int64, bool) {
	switch v := value.(type) {
	case int64:
		return v, true
	case float64:
		return int64(v), true
	case []byte:
		return parseMillisString(string(v))
	case string:
		return parseMillisString(v)
	default:
		return 0, false
	}
}

func parseMillisString(value string) (int64, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, false
	}
	if digitsOnly(value) {
		parsed, err := strconv.ParseInt(value, 10, 64)
		if err == nil {
			return parsed, true
		}
	}
	if parsed, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return parsed.UnixMilli(), true
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed.UnixMilli(), true
	}
	if parsed, err := time.Parse("2006-01-02 15:04:05", value); err == nil {
		return parsed.UnixMilli(), true
	}
	return 0, false
}

func digitsOnly(value string) bool {
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
