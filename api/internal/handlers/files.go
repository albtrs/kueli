package handlers

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"kueli-api/internal/files"
	"kueli-api/internal/httpx"
)

type FilesHandler struct {
	UploadsDir string
}

type uploadResponse struct {
	Filename     string `json:"filename"`
	URL          string `json:"url"`
	Size         int64  `json:"size"`
	Type         string `json:"type"`
	Category     string `json:"category"`
	OriginalName string `json:"originalName"`
}

func (h *FilesHandler) Upload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, files.MaxFileSize+1024)

	if err := r.ParseMultipartForm(files.MaxFileSize + 1024); err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid multipart form"})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "No file uploaded"})
		return
	}
	defer file.Close()

	if header.Size > files.MaxFileSize {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "File size must be less than 50MB"})
		return
	}

	ext := files.ExtensionFromFilename(header.Filename)
	if ext == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "File type not allowed"})
		return
	}

	allowed := files.AllowedExtensions()
	allowedSet := make(map[string]struct{}, len(allowed))
	for _, item := range allowed {
		allowedSet[item] = struct{}{}
	}
	if _, ok := allowedSet[ext]; !ok {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "File type not allowed"})
		return
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

	if !files.IsValidMimeAndExtension(mime, ext) {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "File MIME type does not match extension"})
		return
	}

	if err := os.MkdirAll(h.UploadsDir, 0755); err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save file"})
		return
	}

	filename := buildFilename(ext)
	dstPath := filepath.Join(h.UploadsDir, filename)
	dst, err := os.Create(dstPath)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save file"})
		return
	}
	defer dst.Close()

	reader := io.MultiReader(bytes.NewReader(head), file)
	limited := io.LimitReader(reader, files.MaxFileSize+1)
	written, err := io.Copy(dst, limited)
	if err != nil {
		_ = os.Remove(dstPath)
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save file"})
		return
	}
	if written > files.MaxFileSize {
		_ = os.Remove(dstPath)
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "File size must be less than 50MB"})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, uploadResponse{
		Filename:     filename,
		URL:          filename,
		Size:         written,
		Type:         mime,
		Category:     files.CategoryFromMime(mime),
		OriginalName: header.Filename,
	})
}

func (h *FilesHandler) Serve(w http.ResponseWriter, r *http.Request, filename string) {
	if !isSafeFilename(filename) {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid filename"})
		return
	}

	filePath := filepath.Join(h.UploadsDir, filename)
	data, err := os.ReadFile(filePath)
	if err != nil {
		httpx.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "File not found"})
		return
	}

	ext := strings.ToLower(filepath.Ext(filename))
	mimeType := files.ExtToMIME[ext]
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	headers := w.Header()
	headers.Set("Content-Type", mimeType)
	headers.Set("Cache-Control", "public, max-age=31536000, immutable")
	headers.Set("X-Content-Type-Options", "nosniff")

	if ext == ".svg" || mimeType == "application/octet-stream" {
		headers.Set("Content-Disposition", "attachment; filename=\""+filename+"\"")
	}

	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func buildFilename(ext string) string {
	ext = files.NormalizeExt(ext)
	random := make([]byte, 8)
	if _, err := rand.Read(random); err != nil {
		return strconv.FormatInt(time.Now().UnixMilli(), 10) + ext
	}
	return strconv.FormatInt(time.Now().UnixMilli(), 10) + "-" + hex.EncodeToString(random) + ext
}

func isSafeFilename(name string) bool {
	if name == "" {
		return false
	}
	if strings.Contains(name, "..") {
		return false
	}
	if strings.ContainsAny(name, `/\`) {
		return false
	}
	return true
}
