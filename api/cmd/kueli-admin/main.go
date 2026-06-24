package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"

	"kueli-api/internal/auth"
	"kueli-api/internal/db"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	var (
		databasePath string
		userID       int
		username     string
		newUsername  string
		password     string
	)

	flag.StringVar(&databasePath, "db", defaultDatabasePath(), "path to SQLite database file")
	flag.IntVar(&userID, "id", 0, "target numeric user id")
	flag.StringVar(&username, "username", "", "target current username")
	flag.StringVar(&newUsername, "new-username", "", "new username to set")
	flag.StringVar(&password, "password", "", "new password to set")
	flag.Parse()

	if userID == 0 && strings.TrimSpace(username) == "" {
		log.Fatal("either --id or --username is required")
	}
	if strings.TrimSpace(newUsername) == "" && strings.TrimSpace(password) == "" {
		log.Fatal("at least one of --new-username or --password is required")
	}

	database, err := db.Open(normalizeSQLiteDSN(databasePath))
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer database.Close()

	ctx := context.Background()
	user, err := findUser(ctx, database, userID, strings.TrimSpace(username))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Fatal("user not found")
		}
		log.Fatalf("find user: %v", err)
	}

	nextUsername := user.Username
	if strings.TrimSpace(newUsername) != "" {
		nextUsername = strings.TrimSpace(newUsername)
	}

	nextPasswordHash := user.PasswordHash
	if strings.TrimSpace(password) != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			log.Fatalf("hash password: %v", err)
		}
		nextPasswordHash = string(hash)
	}

	if err := updateUser(ctx, database, user.ID, nextUsername, nextPasswordHash); err != nil {
		log.Fatalf("update user: %v", err)
	}

	if err := auth.RevokeRefreshTokensByUserID(ctx, database, user.ID); err != nil {
		log.Fatalf("revoke refresh tokens: %v", err)
	}

	fmt.Printf("updated user id=%d username=%s\n", user.ID, nextUsername)
	if nextUsername != user.Username {
		fmt.Printf("previous username=%s\n", user.Username)
	}
	if strings.TrimSpace(password) != "" {
		fmt.Println("password updated and refresh tokens revoked")
	} else {
		fmt.Println("refresh tokens revoked")
	}
}

type userRecord struct {
	ID           int
	Username     string
	PasswordHash string
}

func findUser(ctx context.Context, database *sql.DB, userID int, username string) (userRecord, error) {
	var (
		row *sql.Row
		user userRecord
	)

	if userID != 0 {
		row = database.QueryRowContext(ctx, `
SELECT id, username, passwordHash
FROM User
WHERE id = ?
LIMIT 1
`, userID)
	} else {
		row = database.QueryRowContext(ctx, `
SELECT id, username, passwordHash
FROM User
WHERE username = ?
LIMIT 1
`, username)
	}

	err := row.Scan(&user.ID, &user.Username, &user.PasswordHash)
	if err != nil {
		return userRecord{}, err
	}
	return user, nil
}

func updateUser(ctx context.Context, database *sql.DB, userID int, username, passwordHash string) error {
	_, err := database.ExecContext(ctx, `
UPDATE User
SET username = ?, passwordHash = ?, updatedAt = CURRENT_TIMESTAMP
WHERE id = ?
`, username, passwordHash, userID)
	return err
}

func defaultDatabasePath() string {
	if value := strings.TrimSpace(os.Getenv("DATABASE_PATH")); value != "" {
		return value
	}
	return "./data/db/app.db"
}

func normalizeSQLiteDSN(path string) string {
	dsn := strings.TrimSpace(path)
	if dsn == "" {
		dsn = "./data/db/app.db"
	}
	if !strings.HasPrefix(strings.ToLower(dsn), "file:") {
		dsn = "file:" + dsn
	}
	if strings.Contains(dsn, "?") {
		return dsn + "&_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)"
	}
	return dsn + "?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)"
}