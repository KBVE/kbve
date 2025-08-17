#!/bin/bash

# JWT Secret Validation Script for Supabase Realtime
# This script helps validate JWT secrets and debug Base64 padding issues

set -e

echo "🔍 Validating JWT Secret Configuration..."

# Function to check Base64 padding
check_base64_padding() {
    local secret="$1"
    local name="$2"
    
    echo "Checking $name..."
    
    # Check if secret is valid Base64
    if echo "$secret" | base64 -d >/dev/null 2>&1; then
        echo "✅ $name: Valid Base64 encoding"
    else
        echo "❌ $name: Invalid Base64 encoding"
        echo "   Raw value: $secret"
        
        # Try to fix padding
        local fixed=$(echo "$secret" | sed 's/==$//' | sed 's/=$//')
        if echo "${fixed}=" | base64 -d >/dev/null 2>&1; then
            echo "   Suggested fix: ${fixed}="
        elif echo "${fixed}==" | base64 -d >/dev/null 2>&1; then
            echo "   Suggested fix: ${fixed}=="
        fi
    fi
}

# Function to validate JWT structure
validate_jwt() {
    local jwt="$1"
    local name="$2"
    
    echo "Validating $name JWT..."
    
    # Check if it's a valid JWT format (3 parts separated by dots)
    local parts=$(echo "$jwt" | tr -d '\n' | tr '.' '\n' | wc -l)
    if [ "$parts" -eq 3 ]; then
        echo "✅ $name: Valid JWT format (3 parts)"
        
        # Decode header
        local header=$(echo "$jwt" | cut -d'.' -f1)
        if echo "$header" | base64 -d >/dev/null 2>&1; then
            echo "✅ $name: Valid header encoding"
        else
            echo "❌ $name: Invalid header encoding"
        fi
        
        # Decode payload
        local payload=$(echo "$jwt" | cut -d'.' -f2)
        if echo "$payload" | base64 -d >/dev/null 2>&1; then
            echo "✅ $name: Valid payload encoding"
        else
            echo "❌ $name: Invalid payload encoding"
        fi
    else
        echo "❌ $name: Invalid JWT format (expected 3 parts, got $parts)"
    fi
}

# Check environment variables
echo ""
echo "📋 Environment Variables:"
echo "API_JWT_SECRET: ${API_JWT_SECRET:-'Not set'}"
echo "JWT_SECRET: ${JWT_SECRET:-'Not set'}"
echo "SECRET_KEY_BASE: ${SECRET_KEY_BASE:-'Not set'}"

# Validate secrets if they exist
if [ -n "$API_JWT_SECRET" ]; then
    check_base64_padding "$API_JWT_SECRET" "API_JWT_SECRET"
fi

if [ -n "$JWT_SECRET" ]; then
    check_base64_padding "$JWT_SECRET" "JWT_SECRET"
fi

if [ -n "$SECRET_KEY_BASE" ]; then
    check_base64_padding "$SECRET_KEY_BASE" "SECRET_KEY_BASE"
fi

# Check for common JWT tokens
echo ""
echo "🔑 Checking for JWT tokens in configuration..."

# Look for JWT tokens in the current directory
find . -name "*.yaml" -o -name "*.yml" -o -name "*.java" | while read file; do
    echo "Scanning $file..."
    grep -o 'eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*' "$file" 2>/dev/null | while read jwt; do
        validate_jwt "$jwt" "JWT in $file"
    done
done

echo ""
echo "✅ JWT validation complete!"
echo ""
echo "💡 Common fixes for Base64 padding issues:"
echo "1. Ensure JWT secrets are properly Base64 encoded"
echo "2. Check that supabase-jwt secret contains valid Base64 data"
echo "3. Verify JWT tokens are properly formatted"
echo "4. Ensure Realtime service has access to the correct JWT secret"
