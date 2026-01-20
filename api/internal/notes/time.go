package notes

import (
	"strconv"
	"strings"
	"time"
)

func parseTimeValue(value any) time.Time {
	if millis, ok := timeValueToMillis(value); ok {
		return time.UnixMilli(millis).UTC()
	}
	return time.Now().UTC()
}

func timeValueToMillis(value any) (int64, bool) {
	switch v := value.(type) {
	case int64:
		return v, true
	case float64:
		return int64(v), true
	case []byte:
		return parseMillisString(string(v))
	case string:
		return parseMillisString(v)
	default:
		return 0, false
	}
}

func parseMillisString(value string) (int64, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, false
	}
	if digitsOnly(value) {
		parsed, err := strconv.ParseInt(value, 10, 64)
		if err == nil {
			return parsed, true
		}
	}
	if parsed, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return parsed.UnixMilli(), true
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed.UnixMilli(), true
	}
	if parsed, err := time.Parse("2006-01-02 15:04:05", value); err == nil {
		return parsed.UnixMilli(), true
	}
	return 0, false
}

func digitsOnly(value string) bool {
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
