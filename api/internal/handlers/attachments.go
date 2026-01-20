package handlers

import (
	"archive/zip"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"kueli-api/internal/files"
	"kueli-api/internal/httpx"
	"kueli-api/internal/notes"
)

type AttachmentsHandler struct {
	DB         *sql.DB
	UploadsDir string
}

var filenamePattern = regexp.MustCompile(`!\\[.*?\\]\\((?:/api/files/)?([^)]+)\\)`)

type fileUsage struct {
	Status    string `json:"status"`
	InCurrent bool   `json:"inCurrent"`
	InHistory bool   `json:"inHistory"`
}

type attachmentInfo struct {
	Filename  string    `json:"filename"`
	Size      int64     `json:"size"`
	CreatedAt time.Time `json:"createdAt"`
	Status    string    `json:"status"`
	InCurrent bool      `json:"inCurrent"`
	InHistory bool      `json:"inHistory"`
}

func (h *AttachmentsHandler) List(w http.ResponseWriter, r *http.Request) {
	usageMap, err := h.getUsageMap(r.Context())
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	entries, err := os.ReadDir(h.UploadsDir)
	if err != nil && !os.IsNotExist(err) {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	filesList := []attachmentInfo{}
	for _, entry := range entries {
		name := entry.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		usage := usageMap[name]
		status := "unused"
		inCurrent := false
		inHistory := false
		if usage != nil {
			status = usage.Status
			inCurrent = usage.InCurrent
			inHistory = usage.InHistory
		}
		filesList = append(filesList, attachmentInfo{
			Filename:  name,
			Size:      info.Size(),
			CreatedAt: info.ModTime(),
			Status:    status,
			InCurrent: inCurrent,
			InHistory: inHistory,
		})
	}

	sort.Slice(filesList, func(i, j int) bool {
		order := map[string]int{"current": 0, "history": 1, "unused": 2}
		if filesList[i].Status != filesList[j].Status {
			return order[filesList[i].Status] < order[filesList[j].Status]
		}
		return filesList[i].CreatedAt.After(filesList[j].CreatedAt)
	})

	response := map[string]any{
		"files":        filesList,
		"totalCount":   len(filesList),
		"currentCount": countStatus(filesList, "current"),
		"historyCount": countStatus(filesList, "history"),
		"unusedCount":  countStatus(filesList, "unused"),
	}

	httpx.WriteJSON(w, http.StatusOK, response)
}

func (h *AttachmentsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Filenames []string `json:"filenames"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}
	if len(payload.Filenames) == 0 {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "No filenames provided"})
		return
	}

	usageMap, err := h.getUsageMap(r.Context())
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	results := map[string]any{
		"deleted":       []string{},
		"failed":        []map[string]string{},
		"skippedCurrent": []string{},
		"skippedHistory": []string{},
	}

	for _, name := range payload.Filenames {
		if !isSafeFilename(name) {
			results["failed"] = append(results["failed"].([]map[string]string), map[string]string{
				"filename": name,
				"reason":   "Invalid filename",
			})
			continue
		}

		if usage := usageMap[name]; usage != nil {
			if usage.InCurrent {
				results["skippedCurrent"] = append(results["skippedCurrent"].([]string), name)
				continue
			}
			if usage.InHistory {
				results["skippedHistory"] = append(results["skippedHistory"].([]string), name)
				continue
			}
		}

		if err := os.Remove(filepath.Join(h.UploadsDir, name)); err != nil {
			results["failed"] = append(results["failed"].([]map[string]string), map[string]string{
				"filename": name,
				"reason":   "File not found or permission denied",
			})
			continue
		}
		results["deleted"] = append(results["deleted"].([]string), name)
	}

	httpx.WriteJSON(w, http.StatusOK, results)
}

func (h *AttachmentsHandler) Export(w http.ResponseWriter, r *http.Request) {
	entries, err := os.ReadDir(h.UploadsDir)
	if err != nil && !os.IsNotExist(err) {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	var filesToZip []os.DirEntry
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		filesToZip = append(filesToZip, entry)
	}

	if len(filesToZip) == 0 {
		httpx.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "添付ファイルがありません"})
		return
	}

	var buffer bytes.Buffer
	zipWriter := zip.NewWriter(&buffer)

	for _, entry := range filesToZip {
		path := filepath.Join(h.UploadsDir, entry.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		writer, err := zipWriter.Create(entry.Name())
		if err != nil {
			continue
		}
		_, _ = writer.Write(data)
	}

	if err := zipWriter.Close(); err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	date := time.Now().UTC().Format("2006-01-02")
	filename := "attachments_backup_" + date + ".zip"

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+filename+"\"")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(buffer.Bytes())
}

func (h *AttachmentsHandler) Import(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, files.MaxFileSize*2)

	if err := r.ParseMultipartForm(files.MaxFileSize * 2); err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid multipart form"})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "ファイルがアップロードされていません"})
		return
	}
	defer file.Close()

	if !strings.HasSuffix(strings.ToLower(header.Filename), ".zip") && !strings.Contains(header.Header.Get("Content-Type"), "zip") {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "ZIPファイルを選択してください"})
		return
	}

	if err := os.MkdirAll(h.UploadsDir, 0755); err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	buf, err := io.ReadAll(file)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	reader, err := zip.NewReader(bytes.NewReader(buf), int64(len(buf)))
	if err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid zip file"})
		return
	}

	results := map[string]any{
		"imported": []string{},
		"skipped":  []string{},
		"failed":   []map[string]string{},
	}

	for _, entry := range reader.File {
		if entry.FileInfo().IsDir() {
			continue
		}
		name := filepath.Base(entry.Name)
		if !isSafeFilename(name) || strings.HasPrefix(name, ".") {
			results["skipped"] = append(results["skipped"].([]string), entry.Name)
			continue
		}

		src, err := entry.Open()
		if err != nil {
			results["failed"] = append(results["failed"].([]map[string]string), map[string]string{
				"filename": name,
				"reason":   err.Error(),
			})
			continue
		}
		data, err := io.ReadAll(src)
		_ = src.Close()
		if err != nil {
			results["failed"] = append(results["failed"].([]map[string]string), map[string]string{
				"filename": name,
				"reason":   err.Error(),
			})
			continue
		}
		if err := os.WriteFile(filepath.Join(h.UploadsDir, name), data, 0644); err != nil {
			results["failed"] = append(results["failed"].([]map[string]string), map[string]string{
				"filename": name,
				"reason":   err.Error(),
			})
			continue
		}
		results["imported"] = append(results["imported"].([]string), name)
	}

	response := map[string]any{
		"success":       true,
		"imported":      results["imported"],
		"skipped":       results["skipped"],
		"failed":        results["failed"],
		"totalImported": len(results["imported"].([]string)),
	}

	httpx.WriteJSON(w, http.StatusOK, response)
}

func (h *AttachmentsHandler) getUsageMap(ctx context.Context) (map[string]*fileUsage, error) {
	usage := map[string]*fileUsage{}

	noteRows, err := h.DB.QueryContext(ctx, `SELECT content, images FROM Note`)
	if err != nil {
		return nil, err
	}
	defer noteRows.Close()

	for noteRows.Next() {
		var content string
		var images string
		if err := noteRows.Scan(&content, &images); err != nil {
			return nil, err
		}
		h.applyUsage(usage, extractFilenames(content), true)
		for _, name := range notes.ParseJSONList(images) {
			h.applyUsage(usage, []string{name}, true)
		}
	}
	if err := noteRows.Err(); err != nil {
		return nil, err
	}

	versionRows, err := h.DB.QueryContext(ctx, `SELECT content FROM NoteVersion`)
	if err != nil {
		return nil, err
	}
	defer versionRows.Close()

	for versionRows.Next() {
		var content string
		if err := versionRows.Scan(&content); err != nil {
			return nil, err
		}
		h.applyUsage(usage, extractFilenames(content), false)
	}
	if err := versionRows.Err(); err != nil {
		return nil, err
	}

	return usage, nil
}

func (h *AttachmentsHandler) applyUsage(usage map[string]*fileUsage, filenames []string, current bool) {
	for _, name := range filenames {
		if name == "" {
			continue
		}
		item, ok := usage[name]
		if !ok {
			item = &fileUsage{Status: "unused"}
			usage[name] = item
		}
		if current {
			item.InCurrent = true
			item.Status = "current"
		} else {
			item.InHistory = true
			if !item.InCurrent {
				item.Status = "history"
			}
		}
	}
}

func extractFilenames(content string) []string {
	matches := filenamePattern.FindAllStringSubmatch(content, -1)
	if len(matches) == 0 {
		return nil
	}
	results := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		results = append(results, match[1])
	}
	return results
}

func countStatus(items []attachmentInfo, status string) int {
	count := 0
	for _, item := range items {
		if item.Status == status {
			count++
		}
	}
	return count
}
