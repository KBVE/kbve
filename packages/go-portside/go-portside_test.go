package goportside

import (
	"testing"
)

func TestGoPortside(t *testing.T) {
	result := GoPortside("works")
	if result != "GoPortside works" {
		t.Error("Expected GoPortside to append 'works'")
	}
}
