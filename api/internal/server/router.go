package server

import (
	"database/sql"
	"net/http"
	"time"

	"kueli-api/internal/auth"
	"kueli-api/internal/cache"
	"kueli-api/internal/config"
	"kueli-api/internal/handlers"
	"kueli-api/internal/rate"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func NewRouter(cfg config.Config, db *sql.DB) http.Handler {
	router := chi.NewRouter()

	router.Use(middleware.RequestID)
	router.Use(middleware.RealIP)
	router.Use(middleware.Recoverer)
	router.Use(middleware.Timeout(30 * time.Second))

	authHandler := &handlers.AuthHandler{
		DB:      db,
		Config:  cfg,
		Limiter: rate.NewLimiter(time.Minute),
	}
	notesHandler := &handlers.NotesHandler{DB: db}
	filesHandler := &handlers.FilesHandler{UploadsDir: cfg.UploadsDir}
	attachmentsHandler := &handlers.AttachmentsHandler{
		DB:         db,
		UploadsDir: cfg.UploadsDir,
	}
	backupHandler := &handlers.BackupHandler{DB: db}

	cacheStore := cache.New()
	ogpHandler := &handlers.OGPHandler{Cache: cacheStore}
	tweetHandler := &handlers.TweetHandler{Cache: cacheStore}

	router.Route("/api", func(r chi.Router) {
		r.Get("/health", handlers.Health())

		r.Route("/auth", func(r chi.Router) {
			r.Post("/login", authHandler.Login)
			r.Post("/refresh", authHandler.Refresh)
			r.Post("/logout", authHandler.Logout)
			r.With(auth.RequireAccessToken(cfg.JWTSecret)).Get("/me", authHandler.Me)
		})

		r.Group(func(r chi.Router) {
			r.Use(auth.RequireAccessToken(cfg.JWTSecret))

			r.Get("/notes", notesHandler.List)
			r.Post("/notes", notesHandler.Create)
			r.Get("/notes/{id}", notesHandler.Get)
			r.Put("/notes/{id}", notesHandler.Update)
			r.Delete("/notes/{id}", notesHandler.Delete)
			r.Post("/notes/{id}/pin", notesHandler.TogglePin)
			r.Post("/notes/{id}/archive", notesHandler.ToggleArchive)
			r.Post("/notes/{id}/duplicate", notesHandler.Duplicate)
			r.Get("/notes/{id}/versions", notesHandler.Versions)
			r.Get("/notes/{id}/backlinks", notesHandler.Backlinks)

			r.Get("/versions/{id}", notesHandler.Version)
			r.Post("/versions/{id}/restore", notesHandler.RestoreVersion)
			r.Delete("/versions/{id}", notesHandler.DeleteVersion)

			r.Post("/upload", filesHandler.Upload)
			r.Get("/files/{filename}", func(w http.ResponseWriter, r *http.Request) {
				filesHandler.Serve(w, r, chi.URLParam(r, "filename"))
			})

			r.Get("/attachments", attachmentsHandler.List)
			r.Delete("/attachments", attachmentsHandler.Delete)
			r.Get("/attachments/export", attachmentsHandler.Export)
			r.Post("/attachments/import", attachmentsHandler.Import)

			r.Get("/backup/notes", backupHandler.Export)
			r.Post("/backup/notes", backupHandler.Import)

			r.Get("/ogp", ogpHandler.Get)
			r.Get("/tweet", tweetHandler.Get)
		})
	})

	return router
}
