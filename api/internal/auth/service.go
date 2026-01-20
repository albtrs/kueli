package auth

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"kueli-api/internal/config"
	"kueli-api/internal/dbx"
	"kueli-api/internal/store"
)

var ErrInvalidCredentials = errors.New("invalid credentials")
var ErrInvalidRefreshToken = errors.New("invalid refresh token")

type Service struct {
	DB     *sql.DB
	Config config.Config
}

type LoginResult struct {
	User             User
	AccessToken      string
	AccessExpiresAt  time.Time
	RefreshToken     string
	RefreshExpiresAt time.Time
}

type RefreshResult struct {
	AccessToken      string
	AccessExpiresAt  time.Time
	RefreshToken     string
	RefreshExpiresAt time.Time
}

func NewService(db *sql.DB, cfg config.Config) *Service {
	return &Service{DB: db, Config: cfg}
}

func (s *Service) Login(ctx context.Context, username, password string) (LoginResult, error) {
	userRecord, err := store.FindUserByUsername(ctx, s.DB, username)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return LoginResult{}, ErrInvalidCredentials
		}
		return LoginResult{}, err
	}

	if err := ComparePasswordHash(userRecord.PasswordHash, password); err != nil {
		return LoginResult{}, ErrInvalidCredentials
	}

	user := User{
		ID:       userRecord.ID,
		Username: userRecord.Username,
		IsAdmin:  userRecord.IsAdmin,
	}

	accessToken, accessExpiresAt, err := NewAccessToken(user, s.Config.JWTSecret, s.Config.AccessTokenTTL)
	if err != nil {
		return LoginResult{}, err
	}

	refreshToken, refreshHash, refreshID, err := NewRefreshToken()
	if err != nil {
		return LoginResult{}, err
	}

	refreshExpiresAt := time.Now().Add(s.Config.RefreshTokenTTL)
	err = StoreRefreshToken(ctx, s.DB, RefreshTokenRecord{
		ID:        refreshID,
		UserID:    user.ID,
		TokenHash: refreshHash,
		ExpiresAt: refreshExpiresAt,
		CreatedAt: time.Now(),
	})
	if err != nil {
		return LoginResult{}, err
	}

	return LoginResult{
		User:             user,
		AccessToken:      accessToken,
		AccessExpiresAt:  accessExpiresAt,
		RefreshToken:     refreshToken,
		RefreshExpiresAt: refreshExpiresAt,
	}, nil
}

func (s *Service) Refresh(ctx context.Context, refreshToken string) (RefreshResult, error) {
	if refreshToken == "" {
		return RefreshResult{}, ErrInvalidRefreshToken
	}

	tokenHash := HashToken(refreshToken)
	record, user, err := FindValidRefreshToken(ctx, s.DB, tokenHash)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return RefreshResult{}, ErrInvalidRefreshToken
		}
		return RefreshResult{}, err
	}

	accessToken, accessExpiresAt, err := NewAccessToken(user, s.Config.JWTSecret, s.Config.AccessTokenTTL)
	if err != nil {
		return RefreshResult{}, err
	}

	newToken, newHash, newID, err := NewRefreshToken()
	if err != nil {
		return RefreshResult{}, err
	}

	refreshExpiresAt := time.Now().Add(s.Config.RefreshTokenTTL)
	err = dbx.WithTx(ctx, s.DB, func(tx *sql.Tx) error {
		if err := RevokeRefreshToken(ctx, tx, record.TokenHash, newID); err != nil {
			return err
		}
		return StoreRefreshToken(ctx, tx, RefreshTokenRecord{
			ID:        newID,
			UserID:    user.ID,
			TokenHash: newHash,
			ExpiresAt: refreshExpiresAt,
			CreatedAt: time.Now(),
		})
	})
	if err != nil {
		return RefreshResult{}, err
	}

	return RefreshResult{
		AccessToken:      accessToken,
		AccessExpiresAt:  accessExpiresAt,
		RefreshToken:     newToken,
		RefreshExpiresAt: refreshExpiresAt,
	}, nil
}

func (s *Service) Logout(ctx context.Context, refreshToken string) error {
	if refreshToken == "" {
		return nil
	}
	tokenHash := HashToken(refreshToken)
	return RevokeRefreshToken(ctx, s.DB, tokenHash, "")
}
