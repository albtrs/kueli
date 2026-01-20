package files

import (
	"path/filepath"
	"strings"
)

const MaxFileSize = 50 * 1024 * 1024

var AllowedFileTypes = map[string][]string{
	"image/jpeg":                                       {".jpg", ".jpeg"},
	"image/png":                                        {".png"},
	"image/gif":                                        {".gif"},
	"image/webp":                                       {".webp"},
	"application/pdf":                                  {".pdf"},
	"text/plain":                                       {".txt"},
	"text/markdown":                                    {".md"},
	"text/csv":                                         {".csv"},
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": {".docx"},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":       {".xlsx"},
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": {".pptx"},
	"application/zip":                                  {".zip"},
	"application/x-zip-compressed":                     {".zip"},
	"video/mp4":                                        {".mp4"},
	"video/webm":                                       {".webm"},
	"video/quicktime":                                  {".mov"},
	"audio/mpeg":                                       {".mp3"},
	"audio/mp3":                                        {".mp3"},
	"audio/wav":                                        {".wav"},
	"audio/x-m4a":                                      {".m4a"},
	"audio/ogg":                                        {".ogg"},
}

var ExtToMIME = map[string]string{
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".png":  "image/png",
	".gif":  "image/gif",
	".webp": "image/webp",
	".pdf":  "application/pdf",
	".txt":  "text/plain",
	".md":   "text/markdown",
	".csv":  "text/csv",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	".zip":  "application/zip",
	".mp4":  "video/mp4",
	".webm": "video/webm",
	".mov":  "video/quicktime",
	".mp3":  "audio/mpeg",
	".wav":  "audio/wav",
	".m4a":  "audio/x-m4a",
	".ogg":  "audio/ogg",
}

func AllowedExtensions() []string {
	list := make([]string, 0, len(AllowedFileTypes))
	for _, exts := range AllowedFileTypes {
		list = append(list, exts...)
	}
	return list
}

func NormalizeExt(value string) string {
	ext := strings.ToLower(strings.TrimSpace(value))
	if ext == "" {
		return ""
	}
	if !strings.HasPrefix(ext, ".") {
		ext = "." + ext
	}
	return ext
}

func ExtensionFromFilename(name string) string {
	return strings.ToLower(filepath.Ext(name))
}

func IsValidMimeAndExtension(mime, ext string) bool {
	ext = NormalizeExt(ext)
	allowed, ok := AllowedFileTypes[mime]
	if !ok {
		return false
	}
	for _, candidate := range allowed {
		if candidate == ext {
			return true
		}
	}
	return false
}

func CategoryFromMime(mime string) string {
	if strings.HasPrefix(mime, "image/") {
		return "image"
	}
	if strings.HasPrefix(mime, "video/") {
		return "video"
	}
	if strings.HasPrefix(mime, "audio/") {
		return "audio"
	}
	if strings.HasPrefix(mime, "application/pdf") ||
		strings.HasPrefix(mime, "text/") ||
		strings.Contains(mime, "document") ||
		strings.Contains(mime, "spreadsheet") ||
		strings.Contains(mime, "presentation") {
		return "document"
	}
	return "other"
}
