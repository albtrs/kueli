package auth

import (
	"net/http"
	"time"

	"kueli-api/internal/config"
)

func SetRefreshCookie(w http.ResponseWriter, token string, expiresAt time.Time, cfg config.Config) {
	cookie := &http.Cookie{
		Name:     RefreshCookieName,
		Value:    token,
		Path:     "/api",
		HttpOnly: true,
		Secure:   cfg.CookieSecure,
		SameSite: http.SameSiteStrictMode,
		Expires:  expiresAt.UTC(),
	}

	if cfg.CookieDomain != "" {
		cookie.Domain = cfg.CookieDomain
	}

	http.SetCookie(w, cookie)
}

func SetAccessCookie(w http.ResponseWriter, token string, expiresAt time.Time, cfg config.Config) {
	cookie := &http.Cookie{
		Name:     AccessCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   cfg.CookieSecure,
		SameSite: http.SameSiteStrictMode,
		Expires:  expiresAt.UTC(),
	}

	if cfg.CookieDomain != "" {
		cookie.Domain = cfg.CookieDomain
	}

	http.SetCookie(w, cookie)
}

func ClearRefreshCookie(w http.ResponseWriter, cfg config.Config) {
	cookie := &http.Cookie{
		Name:     RefreshCookieName,
		Value:    "",
		Path:     "/api",
		HttpOnly: true,
		Secure:   cfg.CookieSecure,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
	}

	if cfg.CookieDomain != "" {
		cookie.Domain = cfg.CookieDomain
	}

	http.SetCookie(w, cookie)
}

func ClearAccessCookie(w http.ResponseWriter, cfg config.Config) {
	cookie := &http.Cookie{
		Name:     AccessCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   cfg.CookieSecure,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
	}

	if cfg.CookieDomain != "" {
		cookie.Domain = cfg.CookieDomain
	}

	http.SetCookie(w, cookie)
}
