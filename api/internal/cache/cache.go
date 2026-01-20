package cache

import (
	"sync"
	"time"
)

type Cache struct {
	mu    sync.Mutex
	items map[string]entry
}

type entry struct {
	data    []byte
	expires time.Time
}

func New() *Cache {
	return &Cache{
		items: make(map[string]entry),
	}
}

func (c *Cache) Get(key string) ([]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	item, ok := c.items[key]
	if !ok {
		return nil, false
	}
	if time.Now().After(item.expires) {
		delete(c.items, key)
		return nil, false
	}
	return item.data, true
}

func (c *Cache) Set(key string, data []byte, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items[key] = entry{
		data:    data,
		expires: time.Now().Add(ttl),
	}
}
