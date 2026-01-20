package files

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

var (
	ErrNoFileUploaded     = errors.New("no file uploaded")
	ErrFileTooLarge       = errors.New("file size exceeds limit")
	ErrFileTypeNotAllowed = errors.New("file type not allowed")
	ErrMimeMismatch       = errors.New("file MIME type does not match extension")
	ErrSaveFailed         = errors.New("failed to save file")
	ErrInvalidFilename    = errors.New("invalid filename")
	ErrFileNotFound       = errors.New("file not found")
)

type Service struct {
	UploadsDir string
}

type UploadResult struct {
	Filename     string
	Size         int64
	Type         string
	Category     string
	OriginalName string
}

type FileData struct {
	Filename string
	Data     []byte
	MimeType string
}

func NewService(uploadsDir string) *Service {
	return &Service{UploadsDir: uploadsDir}
}

func (s *Service) SaveFile(file multipart.File, header *multipart.FileHeader) (UploadResult, error) {
	if header.Size > MaxFileSize {
		return UploadResult{}, ErrFileTooLarge
	}

	ext := ExtensionFromFilename(header.Filename)
	if ext == "" {
		return UploadResult{}, ErrFileTypeNotAllowed
	}

	if !isAllowedExtension(ext) {
		return UploadResult{}, ErrFileTypeNotAllowed
	}

	head := make([]byte, 512)
	n, _ := io.ReadFull(file, head)
	head = head[:n]

	detected := http.DetectContentType(head)
	provided := strings.TrimSpace(header.Header.Get("Content-Type"))
	mime := provided
	if mime == "" {
		mime = detected
	}

	if !IsValidMimeAndExtension(mime, ext) {
		return UploadResult{}, ErrMimeMismatch
	}

	if err := os.MkdirAll(s.UploadsDir, 0755); err != nil {
		return UploadResult{}, ErrSaveFailed
	}

	filename := buildFilename(ext)
	dstPath := filepath.Join(s.UploadsDir, filename)
	dst, err := os.Create(dstPath)
	if err != nil {
		return UploadResult{}, ErrSaveFailed
	}
	defer dst.Close()

	reader := io.MultiReader(bytes.NewReader(head), file)
	limited := io.LimitReader(reader, MaxFileSize+1)
	written, err := io.Copy(dst, limited)
	if err != nil {
		_ = os.Remove(dstPath)
		return UploadResult{}, ErrSaveFailed
	}
	if written > MaxFileSize {
		_ = os.Remove(dstPath)
		return UploadResult{}, ErrFileTooLarge
	}

	return UploadResult{
		Filename:     filename,
		Size:         written,
		Type:         mime,
		Category:     CategoryFromMime(mime),
		OriginalName: header.Filename,
	}, nil
}

func (s *Service) ServeFile(filename string) (FileData, error) {
	if !IsSafeFilename(filename) {
		return FileData{}, ErrInvalidFilename
	}

	filePath := filepath.Join(s.UploadsDir, filename)
	data, err := os.ReadFile(filePath)
	if err != nil {
		return FileData{}, ErrFileNotFound
	}

	ext := strings.ToLower(filepath.Ext(filename))
	mimeType := ExtToMIME[ext]
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	return FileData{
		Filename: filename,
		Data:     data,
		MimeType: mimeType,
	}, nil
}

func buildFilename(ext string) string {
	ext = NormalizeExt(ext)
	random := make([]byte, 8)
	if _, err := rand.Read(random); err != nil {
		return strconv.FormatInt(time.Now().UnixMilli(), 10) + ext
	}
	return strconv.FormatInt(time.Now().UnixMilli(), 10) + "-" + hex.EncodeToString(random) + ext
}

func isAllowedExtension(ext string) bool {
	allowed := AllowedExtensions()
	for _, item := range allowed {
		if item == ext {
			return true
		}
	}
	return false
}
