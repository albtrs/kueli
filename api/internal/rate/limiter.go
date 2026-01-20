package rate

import (
	"sync"
	"time"
)

type record struct {
	count     int
	resetTime time.Time
}

type Limiter struct {
	mu            sync.Mutex
	records       map[string]*record
	cleanupAfter  time.Duration
	lastCleanupAt time.Time
}

func NewLimiter(cleanupAfter time.Duration) *Limiter {
	return &Limiter{
		records:       make(map[string]*record),
		cleanupAfter:  cleanupAfter,
		lastCleanupAt: time.Now(),
	}
}

func (l *Limiter) Check(key string, limit int, window time.Duration) (allowed bool, remaining int, resetIn time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	if now.Sub(l.lastCleanupAt) >= l.cleanupAfter {
		for k, rec := range l.records {
			if now.After(rec.resetTime) {
				delete(l.records, k)
			}
		}
		l.lastCleanupAt = now
	}

	rec, exists := l.records[key]
	if !exists || now.After(rec.resetTime) {
		l.records[key] = &record{
			count:     1,
			resetTime: now.Add(window),
		}
		return true, limit - 1, window
	}

	if rec.count >= limit {
		return false, 0, rec.resetTime.Sub(now)
	}

	rec.count++
	return true, limit - rec.count, rec.resetTime.Sub(now)
}
