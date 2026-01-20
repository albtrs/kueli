package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	AccessCookieName  = "kueli-access"
	RefreshCookieName = "kueli-refresh"
)

type User struct {
	ID       int
	Username string
	IsAdmin  bool
}

type Claims struct {
	Username string `json:"username"`
	IsAdmin  bool   `json:"isAdmin"`
	Type     string `json:"typ"`
	jwt.RegisteredClaims
}

func NewAccessToken(user User, secret string, ttl time.Duration) (string, time.Time, error) {
	if secret == "" {
		return "", time.Time{}, errors.New("missing jwt secret")
	}

	now := time.Now()
	expiresAt := now.Add(ttl)

	claims := Claims{
		Username: user.Username,
		IsAdmin:  user.IsAdmin,
		Type:     "access",
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   intToString(user.ID),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", time.Time{}, err
	}

	return signed, expiresAt, nil
}

func ParseAccessToken(tokenString, secret string) (User, error) {
	if secret == "" {
		return User{}, errors.New("missing jwt secret")
	}

	parsed, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil {
		return User{}, err
	}

	claims, ok := parsed.Claims.(*Claims)
	if !ok || !parsed.Valid {
		return User{}, errors.New("invalid token")
	}

	if claims.Type != "access" {
		return User{}, errors.New("invalid token type")
	}

	id, err := stringToInt(claims.Subject)
	if err != nil {
		return User{}, err
	}

	return User{
		ID:       id,
		Username: claims.Username,
		IsAdmin:  claims.IsAdmin,
	}, nil
}

func NewRefreshToken() (token string, hash string, id string, err error) {
	raw := make([]byte, 32)
	if _, err = rand.Read(raw); err != nil {
		return "", "", "", err
	}

	idRaw := make([]byte, 16)
	if _, err = rand.Read(idRaw); err != nil {
		return "", "", "", err
	}

	token = hex.EncodeToString(raw)
	id = hex.EncodeToString(idRaw)
	hash = HashToken(token)
	return token, hash, id, nil
}

func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func intToString(value int) string {
	return strconv.Itoa(value)
}

func stringToInt(value string) (int, error) {
	return strconv.Atoi(value)
}
