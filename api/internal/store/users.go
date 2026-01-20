package store

import (
	"context"
	"database/sql"
)

type UserRecord struct {
	ID           int
	Username     string
	PasswordHash string
	IsAdmin      bool
}

func FindUserByUsername(ctx context.Context, db *sql.DB, username string) (UserRecord, error) {
	row := db.QueryRowContext(ctx, `
SELECT id, username, passwordHash, isAdmin
FROM User
WHERE username = ?
LIMIT 1
`, username)

	var record UserRecord
	if err := row.Scan(&record.ID, &record.Username, &record.PasswordHash, &record.IsAdmin); err != nil {
		return UserRecord{}, err
	}

	return record, nil
}
