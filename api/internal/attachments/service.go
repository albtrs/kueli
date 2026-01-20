package attachments

import (
	"archive/zip"
	"bytes"
	"context"
	"database/sql"
	"errors"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"kueli-api/internal/files"
	"kueli-api/internal/notes"
)

var (
	ErrNoAttachments = errors.New("no attachments")
	ErrInvalidZip    = errors.New("invalid zip")
	ErrCreateDir     = errors.New("failed to create upload dir")
)

type Service struct {
	Store      UsageStore
	UploadsDir string
}

type AttachmentInfo struct {
	Filename  string    `json:"filename"`
	Size      int64     `json:"size"`
	CreatedAt time.Time `json:"createdAt"`
	Status    string    `json:"status"`
	InCurrent bool      `json:"inCurrent"`
	InHistory bool      `json:"inHistory"`
}

type ListResult struct {
	Files        []AttachmentInfo `json:"files"`
	TotalCount   int              `json:"totalCount"`
	CurrentCount int              `json:"currentCount"`
	HistoryCount int              `json:"historyCount"`
	UnusedCount  int              `json:"unusedCount"`
}

type Failure struct {
	Filename string `json:"filename"`
	Reason   string `json:"reason"`
}

type DeleteResult struct {
	Deleted        []string  `json:"deleted"`
	Failed         []Failure `json:"failed"`
	SkippedCurrent []string  `json:"skippedCurrent"`
	SkippedHistory []string  `json:"skippedHistory"`
}

type ExportResult struct {
	Filename string
	Data     []byte
}

type ImportResult struct {
	Success       bool      `json:"success"`
	Imported      []string  `json:"imported"`
	Skipped       []string  `json:"skipped"`
	Failed        []Failure `json:"failed"`
	TotalImported int       `json:"totalImported"`
	TotalFailed   int       `json:"totalFailed"`
	TotalSkipped  int       `json:"totalSkipped"`
	Error         string    `json:"error,omitempty"`
}

type fileUsage struct {
	Status    string
	InCurrent bool
	InHistory bool
}

var filenamePattern = regexp.MustCompile(`!\[.*?\]\((?:/api/files/)?([^)]+)\)`)

type UsageStore interface {
	LoadUsageData(ctx context.Context) (NoteUsageData, error)
}

type SQLUsageStore struct {
	DB *sql.DB
}

type NoteUsageData struct {
	Notes    []NoteUsageRow
	Versions []string
}

type NoteUsageRow struct {
	Content string
	Images  string
}

func NewService(db *sql.DB, uploadsDir string) *Service {
	return &Service{Store: &SQLUsageStore{DB: db}, UploadsDir: uploadsDir}
}

func (s *Service) List(ctx context.Context) (ListResult, error) {
	usageMap, err := s.getUsageMap(ctx)
	if err != nil {
		return ListResult{}, err
	}

	entries, err := os.ReadDir(s.UploadsDir)
	if err != nil && !os.IsNotExist(err) {
		return ListResult{}, err
	}

	filesList := []AttachmentInfo{}
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
		filesList = append(filesList, AttachmentInfo{
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

	result := ListResult{
		Files:        filesList,
		TotalCount:   len(filesList),
		CurrentCount: countStatus(filesList, "current"),
		HistoryCount: countStatus(filesList, "history"),
		UnusedCount:  countStatus(filesList, "unused"),
	}
	return result, nil
}

func (s *Service) Delete(ctx context.Context, filenames []string) (DeleteResult, error) {
	usageMap, err := s.getUsageMap(ctx)
	if err != nil {
		return DeleteResult{}, err
	}

	results := DeleteResult{
		Deleted:        []string{},
		Failed:         []Failure{},
		SkippedCurrent: []string{},
		SkippedHistory: []string{},
	}

	for _, name := range filenames {
		if !files.IsSafeFilename(name) {
			results.Failed = append(results.Failed, Failure{
				Filename: name,
				Reason:   "Invalid filename",
			})
			continue
		}

		if usage := usageMap[name]; usage != nil {
			if usage.InCurrent {
				results.SkippedCurrent = append(results.SkippedCurrent, name)
				continue
			}
			if usage.InHistory {
				results.SkippedHistory = append(results.SkippedHistory, name)
				continue
			}
		}

		if err := os.Remove(filepath.Join(s.UploadsDir, name)); err != nil {
			results.Failed = append(results.Failed, Failure{
				Filename: name,
				Reason:   "File not found or permission denied",
			})
			continue
		}
		results.Deleted = append(results.Deleted, name)
	}

	return results, nil
}

func (s *Service) Export(ctx context.Context) (ExportResult, error) {
	entries, err := os.ReadDir(s.UploadsDir)
	if err != nil && !os.IsNotExist(err) {
		return ExportResult{}, err
	}

	var filesToZip []os.DirEntry
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		filesToZip = append(filesToZip, entry)
	}

	if len(filesToZip) == 0 {
		return ExportResult{}, ErrNoAttachments
	}

	var buffer bytes.Buffer
	zipWriter := zip.NewWriter(&buffer)

	for _, entry := range filesToZip {
		path := filepath.Join(s.UploadsDir, entry.Name())
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
		return ExportResult{}, err
	}

	date := time.Now().UTC().Format("2006-01-02")
	filename := "attachments_backup_" + date + ".zip"

	return ExportResult{
		Filename: filename,
		Data:     buffer.Bytes(),
	}, nil
}

func (s *Service) Import(ctx context.Context, data []byte) (ImportResult, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return ImportResult{}, ErrInvalidZip
	}

	if err := os.MkdirAll(s.UploadsDir, 0755); err != nil {
		return ImportResult{}, ErrCreateDir
	}

	results := ImportResult{
		Imported: []string{},
		Skipped:  []string{},
		Failed:   []Failure{},
	}

	maxTotalSize := int64(files.MaxFileSize) * 4
	var totalSize int64

	for _, entry := range reader.File {
		if entry.FileInfo().IsDir() {
			continue
		}
		if entry.UncompressedSize64 > uint64(files.MaxFileSize) {
			results.Failed = append(results.Failed, Failure{
				Filename: entry.Name,
				Reason:   "File is too large",
			})
			continue
		}
		if entry.UncompressedSize64 > 0 && totalSize+int64(entry.UncompressedSize64) > maxTotalSize {
			results.Failed = append(results.Failed, Failure{
				Filename: entry.Name,
				Reason:   "Total size exceeds limit",
			})
			continue
		}
		name := filepath.Base(entry.Name)
		if !files.IsSafeFilename(name) || strings.HasPrefix(name, ".") {
			results.Skipped = append(results.Skipped, entry.Name)
			continue
		}

		src, err := entry.Open()
		if err != nil {
			results.Failed = append(results.Failed, Failure{
				Filename: name,
				Reason:   err.Error(),
			})
			continue
		}
		payload, err := io.ReadAll(io.LimitReader(src, files.MaxFileSize+1))
		_ = src.Close()
		if err != nil {
			results.Failed = append(results.Failed, Failure{
				Filename: name,
				Reason:   err.Error(),
			})
			continue
		}
		if int64(len(payload)) > files.MaxFileSize {
			results.Failed = append(results.Failed, Failure{
				Filename: name,
				Reason:   "File is too large",
			})
			continue
		}
		if totalSize+int64(len(payload)) > maxTotalSize {
			results.Failed = append(results.Failed, Failure{
				Filename: name,
				Reason:   "Total size exceeds limit",
			})
			continue
		}
		if err := os.WriteFile(filepath.Join(s.UploadsDir, name), payload, 0644); err != nil {
			results.Failed = append(results.Failed, Failure{
				Filename: name,
				Reason:   err.Error(),
			})
			continue
		}
		totalSize += int64(len(payload))
		results.Imported = append(results.Imported, name)
	}

	results.TotalImported = len(results.Imported)
	results.TotalFailed = len(results.Failed)
	results.TotalSkipped = len(results.Skipped)
	results.Success = results.TotalFailed == 0
	if !results.Success {
		results.Error = "一部のファイルのインポートに失敗しました"
	}

	return results, nil
}

func (s *Service) getUsageMap(ctx context.Context) (map[string]*fileUsage, error) {
	usage := map[string]*fileUsage{}

	data, err := s.Store.LoadUsageData(ctx)
	if err != nil {
		return nil, err
	}

	for _, row := range data.Notes {
		applyUsage(usage, extractFilenames(row.Content), true)
		for _, name := range notes.ParseJSONList(row.Images) {
			applyUsage(usage, []string{name}, true)
		}
	}

	for _, content := range data.Versions {
		applyUsage(usage, extractFilenames(content), false)
	}

	return usage, nil
}

func (s *SQLUsageStore) LoadUsageData(ctx context.Context) (NoteUsageData, error) {
	noteRows, err := s.DB.QueryContext(ctx, `SELECT content, images FROM Note`)
	if err != nil {
		return NoteUsageData{}, err
	}
	defer noteRows.Close()

	notesData := []NoteUsageRow{}
	for noteRows.Next() {
		var content string
		var images string
		if err := noteRows.Scan(&content, &images); err != nil {
			return NoteUsageData{}, err
		}
		notesData = append(notesData, NoteUsageRow{
			Content: content,
			Images:  images,
		})
	}
	if err := noteRows.Err(); err != nil {
		return NoteUsageData{}, err
	}

	versionRows, err := s.DB.QueryContext(ctx, `SELECT content FROM NoteVersion`)
	if err != nil {
		return NoteUsageData{}, err
	}
	defer versionRows.Close()

	versions := []string{}
	for versionRows.Next() {
		var content string
		if err := versionRows.Scan(&content); err != nil {
			return NoteUsageData{}, err
		}
		versions = append(versions, content)
	}
	if err := versionRows.Err(); err != nil {
		return NoteUsageData{}, err
	}

	return NoteUsageData{
		Notes:    notesData,
		Versions: versions,
	}, nil
}

func applyUsage(usage map[string]*fileUsage, filenames []string, current bool) {
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

func countStatus(items []AttachmentInfo, status string) int {
	count := 0
	for _, item := range items {
		if item.Status == status {
			count++
		}
	}
	return count
}
