package httpx

import (
	"encoding/json"
	"net"
	"net/http"
	"strings"
)

func ClientIP(r *http.Request) string {
	forwarded := r.Header.Get("x-forwarded-for")
	if forwarded != "" {
		parts := strings.Split(forwarded, ",")
		if len(parts) > 0 {
			return strings.TrimSpace(parts[0])
		}
	}

	realIP := r.Header.Get("x-real-ip")
	if realIP != "" {
		return strings.TrimSpace(realIP)
	}

	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

func DecodeJSON(r *http.Request, payload any) error {
	if err := json.NewDecoder(r.Body).Decode(payload); err != nil {
		return BadRequest("Invalid request body").WithCause(err)
	}
	return nil
}
