package notes

import "database/sql"

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
