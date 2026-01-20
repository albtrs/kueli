package config

import (
	"errors"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Env             string
	Addr            string
	DatabaseDSN     string
	UploadsDir      string
	JWTSecret       string
	AccessTokenTTL  time.Duration
	RefreshTokenTTL time.Duration
	CookieDomain    string
	CookieSecure    bool
	LogLevel        slog.Level
}

func Load() (Config, error) {
	env := getEnv("APP_ENV", "development")
	port := getEnv("PORT", "8080")
	addr := ":" + port

	dsn, err := buildSQLiteDSN()
	if err != nil {
		return Config{}, err
	}

	uploadsDir := getEnv("UPLOADS_DIR", "./data/uploads")

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = os.Getenv("SESSION_SECRET")
	}
	if strings.TrimSpace(jwtSecret) == "" {
		return Config{}, errors.New("JWT_SECRET (or SESSION_SECRET) is required")
	}

	accessTTL := parseDurationEnv("ACCESS_TOKEN_TTL", 15*time.Minute)
	refreshTTL := parseDurationEnv("REFRESH_TOKEN_TTL", 30*24*time.Hour)

	cookieDomain := os.Getenv("COOKIE_DOMAIN")
	cookieSecure := parseBoolEnv("COOKIE_SECURE", env == "production")

	level := slog.LevelInfo
	if env == "development" {
		level = slog.LevelDebug
	}

	return Config{
		Env:             env,
		Addr:            addr,
		DatabaseDSN:     dsn,
		UploadsDir:      uploadsDir,
		JWTSecret:       jwtSecret,
		AccessTokenTTL:  accessTTL,
		RefreshTokenTTL: refreshTTL,
		CookieDomain:    cookieDomain,
		CookieSecure:    cookieSecure,
		LogLevel:        level,
	}, nil
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); strings.TrimSpace(value) != "" {
		return value
	}
	return fallback
}

func parseDurationEnv(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func parseBoolEnv(key string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func buildSQLiteDSN() (string, error) {
	if raw := strings.TrimSpace(os.Getenv("DATABASE_URL")); raw != "" {
		return normalizeSQLiteDSN(raw), nil
	}
	path := strings.TrimSpace(os.Getenv("DATABASE_PATH"))
	if path == "" {
		path = "./data/prisma/app.db"
	}
	return normalizeSQLiteDSN(path), nil
}

func normalizeSQLiteDSN(raw string) string {
	dsn := raw
	if !strings.HasPrefix(strings.ToLower(dsn), "file:") {
		dsn = "file:" + dsn
	}

	if strings.Contains(dsn, "?") {
		dsn += "&"
	} else {
		dsn += "?"
	}

	dsn += "_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)"
	return dsn
}
