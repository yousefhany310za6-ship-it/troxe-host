package auth

import (
	"fmt"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	ServerID    string            `json:"server_id"`
	UserID      string            `json:"user_id"`
	Permissions map[string]bool   `json:"permissions"`
	jwt.RegisteredClaims
}

func (c *Claims) HasPermission(permission string) bool {
	if c.Permissions == nil {
		return false
	}
	return c.Permissions[permission]
}

func ValidateJWT(tokenStr, daemonSecret string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(daemonSecret), nil
	})

	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}

	return claims, nil
}
