package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"kueli-api/internal/auth"
	"kueli-api/internal/config"
	"kueli-api/internal/httpx"
	"kueli-api/internal/rate"
)

const (
	loginRateLimit  = 5
	loginRateWindow = time.Minute
)

type AuthHandler struct {
	Service *auth.Service
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
		httpx.WriteError(w, httpx.TooManyRequests("Too many login attempts. Please try again later."))
		return
	}

	var payload loginRequest
	if err := httpx.DecodeJSON(r, &payload); err != nil {
		httpx.WriteError(w, err)
		return
	}
	payload.Username = strings.TrimSpace(payload.Username)
	if payload.Username == "" || payload.Password == "" {
		httpx.WriteError(w, httpx.BadRequest("Username and password are required"))
		return
	}

	result, err := h.Service.Login(r.Context(), payload.Username, payload.Password)
	if err != nil {
		if errors.Is(err, auth.ErrInvalidCredentials) {
			httpx.WriteError(w, httpx.Unauthorized("Invalid credentials"))
			return
		}
		httpx.WriteError(w, httpx.InternalServerError(""))
		return
	}

	auth.SetAccessCookie(w, result.AccessToken, result.AccessExpiresAt, h.Config)
	auth.SetRefreshCookie(w, result.RefreshToken, result.RefreshExpiresAt, h.Config)

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"user": authUserResponse{
			ID:       result.User.ID,
			Username: result.User.Username,
			IsAdmin:  result.User.IsAdmin,
		},
		"accessToken": result.AccessToken,
		"tokenType":   "Bearer",
		"expiresIn":   int(h.Config.AccessTokenTTL.Seconds()),
	})
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(auth.RefreshCookieName)
	if err != nil || cookie.Value == "" {
		httpx.WriteError(w, httpx.Unauthorized(""))
		return
	}

	result, err := h.Service.Refresh(r.Context(), cookie.Value)
	if err != nil {
		if errors.Is(err, auth.ErrInvalidRefreshToken) {
			httpx.WriteError(w, httpx.Unauthorized(""))
			return
		}
		httpx.WriteError(w, httpx.InternalServerError(""))
		return
	}

	auth.SetRefreshCookie(w, result.RefreshToken, result.RefreshExpiresAt, h.Config)
	auth.SetAccessCookie(w, result.AccessToken, result.AccessExpiresAt, h.Config)

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"accessToken": result.AccessToken,
		"tokenType":   "Bearer",
		"expiresIn":   int(h.Config.AccessTokenTTL.Seconds()),
	})
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(auth.RefreshCookieName)
	if err == nil && cookie.Value != "" {
		_ = h.Service.Logout(r.Context(), cookie.Value)
	}

	auth.ClearRefreshCookie(w, h.Config)
	auth.ClearAccessCookie(w, h.Config)
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, httpx.Unauthorized(""))
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
