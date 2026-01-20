package auth

import (
	"context"
	"net/http"
	"strings"

	"kueli-api/internal/httpx"
)

type contextKey string

const userContextKey contextKey = "authUser"

func RequireAccessToken(secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer"))
			if token == "" {
				if cookie, err := r.Cookie(AccessCookieName); err == nil {
					token = strings.TrimSpace(cookie.Value)
				}
			}
			if token == "" {
				httpx.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
				return
			}

			user, err := ParseAccessToken(token, secret)
			if err != nil {
				httpx.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
				return
			}

			ctx := context.WithValue(r.Context(), userContextKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func UserFromContext(ctx context.Context) (User, bool) {
	user, ok := ctx.Value(userContextKey).(User)
	return user, ok
}
