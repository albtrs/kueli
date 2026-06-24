package auth

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

type RefreshTokenRecord struct {
	ID        string
	UserID    int
	TokenHash string
	ExpiresAt time.Time
	RevokedAt sql.NullTime
	ReplacedBy sql.NullString
	CreatedAt time.Time
}

func EnsureRefreshTokenTable(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, `
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME,
  replaced_by TEXT,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens(user_id);
`)
	return err
}

type execer interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func StoreRefreshToken(ctx context.Context, db execer, record RefreshTokenRecord) error {
	_, err := db.ExecContext(ctx, `
INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, replaced_by, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?)`,
		record.ID,
		record.UserID,
		record.TokenHash,
		record.ExpiresAt.UTC().Format(time.RFC3339Nano),
		nullTimeToString(record.RevokedAt),
		nullStringToString(record.ReplacedBy),
		record.CreatedAt.UTC().Format(time.RFC3339Nano),
	)
	return err
}

func FindValidRefreshToken(ctx context.Context, db *sql.DB, tokenHash string) (RefreshTokenRecord, User, error) {
	row := db.QueryRowContext(ctx, `
SELECT rt.id, rt.user_id, rt.token_hash, rt.expires_at, rt.revoked_at, rt.replaced_by, rt.created_at,
       u.username, u.isAdmin
FROM refresh_tokens rt
JOIN User u ON u.id = rt.user_id
WHERE rt.token_hash = ? AND rt.revoked_at IS NULL
LIMIT 1
`, tokenHash)

	var record RefreshTokenRecord
	var expiresAtStr string
	var revokedAt sql.NullString
	var replacedBy sql.NullString
	var createdAtStr string
	var user User

	if err := row.Scan(
		&record.ID,
		&record.UserID,
		&record.TokenHash,
		&expiresAtStr,
		&revokedAt,
		&replacedBy,
		&createdAtStr,
		&user.Username,
		&user.IsAdmin,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return RefreshTokenRecord{}, User{}, err
		}
		return RefreshTokenRecord{}, User{}, err
	}

	var err error
	record.ExpiresAt, err = time.Parse(time.RFC3339Nano, expiresAtStr)
	if err != nil {
		return RefreshTokenRecord{}, User{}, err
	}

	record.CreatedAt, err = time.Parse(time.RFC3339Nano, createdAtStr)
	if err != nil {
		return RefreshTokenRecord{}, User{}, err
	}

	record.RevokedAt = parseNullTime(revokedAt)
	record.ReplacedBy = parseNullString(replacedBy)

	user.ID = record.UserID

	if time.Now().After(record.ExpiresAt) {
		return RefreshTokenRecord{}, User{}, sql.ErrNoRows
	}

	return record, user, nil
}

func RevokeRefreshToken(ctx context.Context, db execer, tokenHash string, replacedBy string) error {
	_, err := db.ExecContext(ctx, `
UPDATE refresh_tokens
SET revoked_at = ?, replaced_by = ?
WHERE token_hash = ? AND revoked_at IS NULL`,
		time.Now().UTC().Format(time.RFC3339Nano),
		emptyToNullString(replacedBy),
		tokenHash,
	)
	return err
}

func RevokeRefreshTokensByUserID(ctx context.Context, db execer, userID int) error {
	_, err := db.ExecContext(ctx, `
UPDATE refresh_tokens
SET revoked_at = ?, replaced_by = NULL
WHERE user_id = ? AND revoked_at IS NULL`,
		time.Now().UTC().Format(time.RFC3339Nano),
		userID,
	)
	return err
}

func nullTimeToString(value sql.NullTime) any {
	if value.Valid {
		return value.Time.UTC().Format(time.RFC3339Nano)
	}
	return nil
}

func parseNullTime(value sql.NullString) sql.NullTime {
	if !value.Valid || value.String == "" {
		return sql.NullTime{}
	}
	parsed, err := time.Parse(time.RFC3339Nano, value.String)
	if err != nil {
		return sql.NullTime{}
	}
	return sql.NullTime{Time: parsed, Valid: true}
}

func parseNullString(value sql.NullString) sql.NullString {
	if value.Valid && value.String != "" {
		return value
	}
	return sql.NullString{}
}

func emptyToNullString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func nullStringToString(value sql.NullString) any {
	if value.Valid && value.String != "" {
		return value.String
	}
	return nil
}
