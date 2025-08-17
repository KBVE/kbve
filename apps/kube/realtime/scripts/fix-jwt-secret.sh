#!/bin/bash

# JWT Secret Fix Script for Supabase Realtime
# This script helps fix JWT secret configuration issues

set -e

echo "🔧 Fixing JWT Secret Configuration..."

# Function to generate a secure random secret
generate_secret() {
    openssl rand -base64 32
}

# Function to check if a secret is valid Base64
is_valid_base64() {
    local secret="$1"
    echo "$secret" | base64 -d >/dev/null 2>&1
}

# Function to fix Base64 padding
fix_base64_padding() {
    local secret="$1"
    local fixed
    
    # Remove existing padding
    fixed=$(echo "$secret" | sed 's/==$//' | sed 's/=$//')
    
    # Try to add correct padding
    if echo "${fixed}=" | base64 -d >/dev/null 2>&1; then
        echo "${fixed}="
    elif echo "${fixed}==" | base64 -d >/dev/null 2>&1; then
        echo "${fixed}=="
    else
        echo "Unable to fix padding for: $secret"
        return 1
    fi
}

echo "📋 Current Configuration Status:"

# Check if we're in a Kubernetes context
if command -v kubectl >/dev/null 2>&1; then
    echo "✅ kubectl found, checking current secrets..."
    
    # Check current secrets
    if kubectl get secret supabase-jwt -n kilobase >/dev/null 2>&1; then
        echo "✅ supabase-jwt secret exists"
        
        # Get the current JWT secret
        current_secret=$(kubectl get secret supabase-jwt -n kilobase -o jsonpath='{.data.secret}' | base64 -d 2>/dev/null || echo "")
        
        if [ -n "$current_secret" ]; then
            echo "Current JWT secret length: ${#current_secret}"
            
            if is_valid_base64 "$current_secret"; then
                echo "✅ Current JWT secret has valid Base64 encoding"
            else
                echo "❌ Current JWT secret has invalid Base64 encoding"
                echo "Attempting to fix padding..."
                
                fixed_secret=$(fix_base64_padding "$current_secret")
                if [ $? -eq 0 ]; then
                    echo "✅ Fixed JWT secret padding: $fixed_secret"
                else
                    echo "❌ Could not fix JWT secret padding"
                fi
            fi
        else
            echo "❌ Could not retrieve current JWT secret"
        fi
    else
        echo "❌ supabase-jwt secret not found"
    fi
else
    echo "⚠️  kubectl not found, running in local mode"
fi

echo ""
echo "🛠️  Recommended Actions:"

echo "1. **Regenerate JWT Secret** (if current one is corrupted):"
echo "   kubectl create secret generic supabase-jwt -n kilobase --from-literal=secret=$(generate_secret) --dry-run=client -o yaml | kubectl apply -f -"

echo ""
echo "2. **Update Realtime Deployment** with the new configuration:"
echo "   kubectl apply -f apps/kube/realtime/manifests/"

echo ""
echo "3. **Restart Realtime Service** to pick up new configuration:"
echo "   kubectl rollout restart deployment/realtime -n kilobase"

echo ""
echo "4. **Verify the fix** by checking logs:"
echo "   kubectl logs -n kilobase -l app=realtime -f"

echo ""
echo "🔍 **Manual Verification Steps:**"

echo "1. Check that the JWT secret is properly Base64 encoded:"
echo "   kubectl get secret supabase-jwt -n kilobase -o jsonpath='{.data.secret}' | base64 -d | wc -c"

echo ""
echo "2. Verify Realtime service environment variables:"
echo "   kubectl get pod -n kilobase -l app=realtime -o jsonpath='{.items[0].spec.containers[0].env[*]}'"

echo ""
echo "3. Test WebSocket connection:"
echo "   curl -i -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: $(openssl rand -base64 16)' -H 'apikey: YOUR_API_KEY' 'ws://localhost:8086/realtime/v1/'"

echo ""
echo "✅ Fix script completed!"
echo ""
echo "💡 **Next Steps:**"
echo "1. Run the recommended kubectl commands above"
echo "2. Monitor the Realtime service logs for errors"
echo "3. Test your WebSocket connection"
echo "4. If issues persist, run the validation script: ./validate-jwt.sh"
