package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"kueli-api/internal/auth"
	"kueli-api/internal/config"
	"kueli-api/internal/httpx"
	"kueli-api/internal/rate"
	"kueli-api/internal/store"

	"strconv"
)

const (
	loginRateLimit  = 5
	loginRateWindow = time.Minute
)

type AuthHandler struct {
	DB      *sql.DB
	Config  config.Config
	Limiter *rate.Limiter
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type authUserResponse struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	IsAdmin  bool   `json:"isAdmin"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	ip := httpx.ClientIP(r)
	allowed, _, resetIn := h.Limiter.Check("login:"+ip, loginRateLimit, loginRateWindow)
	if !allowed {
		w.Header().Set("Retry-After", strconv.Itoa(int(resetIn.Seconds())))
		w.Header().Set("X-RateLimit-Remaining", "0")
		httpx.WriteJSON(w, http.StatusTooManyRequests, map[string]string{
			"error": "Too many login attempts. Please try again later.",
		})
		return
	}

	var payload loginRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}
	payload.Username = strings.TrimSpace(payload.Username)
	if payload.Username == "" || payload.Password == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Username and password are required"})
		return
	}

	ctx := r.Context()
	userRecord, err := store.FindUserByUsername(ctx, h.DB, payload.Username)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid credentials"})
			return
		}
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	if err := auth.ComparePasswordHash(userRecord.PasswordHash, payload.Password); err != nil {
		httpx.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid credentials"})
		return
	}

	user := auth.User{
		ID:       userRecord.ID,
		Username: userRecord.Username,
		IsAdmin:  userRecord.IsAdmin,
	}

	accessToken, accessExpiresAt, err := auth.NewAccessToken(user, h.Config.JWTSecret, h.Config.AccessTokenTTL)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	refreshToken, refreshHash, refreshID, err := auth.NewRefreshToken()
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	expiresAt := time.Now().Add(h.Config.RefreshTokenTTL)
	err = auth.StoreRefreshToken(ctx, h.DB, auth.RefreshTokenRecord{
		ID:        refreshID,
		UserID:    user.ID,
		TokenHash: refreshHash,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now(),
	})
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	auth.SetAccessCookie(w, accessToken, accessExpiresAt, h.Config)
	auth.SetRefreshCookie(w, refreshToken, expiresAt, h.Config)

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"user": authUserResponse{
			ID:       user.ID,
			Username: user.Username,
			IsAdmin:  user.IsAdmin,
		},
		"accessToken": accessToken,
		"tokenType":   "Bearer",
		"expiresIn":   int(h.Config.AccessTokenTTL.Seconds()),
	})
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(auth.RefreshCookieName)
	if err != nil || cookie.Value == "" {
		httpx.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	tokenHash := auth.HashToken(cookie.Value)
	ctx := r.Context()

	record, user, err := auth.FindValidRefreshToken(ctx, h.DB, tokenHash)
	if err != nil {
		httpx.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	accessToken, accessExpiresAt, err := auth.NewAccessToken(user, h.Config.JWTSecret, h.Config.AccessTokenTTL)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	newToken, newHash, newID, err := auth.NewRefreshToken()
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	expiresAt := time.Now().Add(h.Config.RefreshTokenTTL)

	err = withTx(ctx, h.DB, func(tx *sql.Tx) error {
		if err := auth.RevokeRefreshToken(ctx, tx, record.TokenHash, newID); err != nil {
			return err
		}
		return auth.StoreRefreshToken(ctx, tx, auth.RefreshTokenRecord{
			ID:        newID,
			UserID:    user.ID,
			TokenHash: newHash,
			ExpiresAt: expiresAt,
			CreatedAt: time.Now(),
		})
	})
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}

	auth.SetRefreshCookie(w, newToken, expiresAt, h.Config)
	auth.SetAccessCookie(w, accessToken, accessExpiresAt, h.Config)

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"accessToken": accessToken,
		"tokenType":   "Bearer",
		"expiresIn":   int(h.Config.AccessTokenTTL.Seconds()),
	})
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(auth.RefreshCookieName)
	if err == nil && cookie.Value != "" {
		tokenHash := auth.HashToken(cookie.Value)
		_ = auth.RevokeRefreshToken(r.Context(), h.DB, tokenHash, "")
	}

	auth.ClearRefreshCookie(w, h.Config)
	auth.ClearAccessCookie(w, h.Config)
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"user": authUserResponse{
			ID:       user.ID,
			Username: user.Username,
			IsAdmin:  user.IsAdmin,
		},
	})
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
