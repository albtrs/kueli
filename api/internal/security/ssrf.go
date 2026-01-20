package security

import (
	"net"
	"net/url"
	"strings"
)

type URLValidation struct {
	Valid  bool
	Reason string
}

func IsValidExternalURL(raw string) URLValidation {
	parsed, err := url.Parse(raw)
	if err != nil {
		return URLValidation{Valid: false, Reason: "Invalid URL format"}
	}

	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return URLValidation{Valid: false, Reason: "Only HTTP and HTTPS protocols are allowed"}
	}

	host := strings.ToLower(parsed.Hostname())
	if host == "" {
		return URLValidation{Valid: false, Reason: "Invalid URL format"}
	}

	if isPrivateIP(host) {
		return URLValidation{Valid: false, Reason: "Private IP addresses are not allowed"}
	}

	blocked := []string{
		"localhost",
		"localhost.localdomain",
		"kubernetes.default",
		"kubernetes.default.svc",
	}

	for _, pattern := range blocked {
		if host == pattern {
			return URLValidation{Valid: false, Reason: "Internal hostnames are not allowed"}
		}
	}

	if strings.HasSuffix(host, ".local") {
		return URLValidation{Valid: false, Reason: "Internal hostnames are not allowed"}
	}

	return URLValidation{Valid: true}
}

func isPrivateIP(host string) bool {
	host = strings.Trim(host, "[]")
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}

	if ip4 := ip.To4(); ip4 != nil {
		a, b, c, d := ip4[0], ip4[1], ip4[2], ip4[3]
		_ = d

		if a == 0 || a == 10 || a == 127 {
			return true
		}
		if a == 100 && b >= 64 && b <= 127 {
			return true
		}
		if a == 169 && b == 254 {
			return true
		}
		if a == 172 && b >= 16 && b <= 31 {
			return true
		}
		if a == 192 && b == 0 && c == 0 {
			return true
		}
		if a == 192 && b == 0 && c == 2 {
			return true
		}
		if a == 192 && b == 88 && c == 99 {
			return true
		}
		if a == 192 && b == 168 {
			return true
		}
		if a == 198 && (b == 18 || b == 19) {
			return true
		}
		if a == 198 && b == 51 && c == 100 {
			return true
		}
		if a == 203 && b == 0 && c == 113 {
			return true
		}
		if a >= 224 && a <= 239 {
			return true
		}
		if a >= 240 {
			return true
		}
		return false
	}

	ip = ip.To16()
	if ip == nil {
		return false
	}

	if ip.IsLoopback() || ip.IsUnspecified() {
		return true
	}

	if ip[0]&0xfe == 0xfc {
		return true
	}

	if ip[0] == 0xfe && ip[1]&0xc0 == 0x80 {
		return true
	}

	return false
}
