package pkg

import (
    "crypto/sha256"
    "fmt"
)

func GenerateSessionHash(playerID string) string {
    hash := sha256.Sum256([]byte(playerID))
    return fmt.Sprintf("%x", hash)
}

func ValidateSessionHash(sessionHash, playerID string) bool {
    return GenerateSessionHash(playerID) == sessionHash
}
