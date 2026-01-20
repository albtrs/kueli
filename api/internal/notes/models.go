package notes

import "time"

type Note struct {
	ID         string    `json:"id"`
	Title      string    `json:"title"`
	Content    string    `json:"content"`
	IsPinned   bool      `json:"isPinned"`
	IsArchived bool      `json:"isArchived"`
	Tags       []string  `json:"tags"`
	Images     []string  `json:"images"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type NoteVersion struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	Tags      string    `json:"tags"`
	CreatedAt time.Time `json:"createdAt"`
	NoteID    string    `json:"noteId"`
}

type ListOptions struct {
	Cursor          string
	Limit           int
	Tag             string
	Search          string
	IncludeArchived bool
	ExcludePinned   bool
	SortOrder       string
}

type NotePayload struct {
	Title      *string   `json:"title"`
	Content    *string   `json:"content"`
	IsPinned   *bool     `json:"isPinned"`
	IsArchived *bool     `json:"isArchived"`
	Tags       *[]string `json:"tags"`
	Images     *[]string `json:"images"`
}
