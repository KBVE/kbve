# Supabase Realtime Troubleshooting Guide

## WebSocket Connection Error: "incorrect padding"

### Problem Description
The error "incorrect padding" in Base64 decoding occurs when the Realtime service tries to decrypt the API key. This typically happens due to:

1. **JWT Secret Mismatch**: The JWT secret used to sign the API key doesn't match the one configured in Realtime
2. **Base64 Encoding Issues**: The JWT secret has malformed Base64 encoding
3. **API Key Format**: The API key format is incompatible with what Realtime expects

### Error Details
```
** (ArgumentError) incorrect padding
    (elixir 1.17.3) lib/base.ex:735: Base.decode64base!/2
    (realtime 2.41.24) lib/realtime/crypto.ex:24: Realtime.Crypto.decrypt!/1
```

### Root Cause
The issue is in the JWT secret configuration. The Realtime service is trying to decode a Base64-encoded JWT secret, but the encoding is malformed or the secret doesn't match the expected format.

### Solutions

#### 1. Validate JWT Secrets
Run the validation script to check your JWT configuration:
```bash
cd apps/kube/realtime/scripts
./validate-jwt.sh
```

#### 2. Check Secret Configuration
Ensure the following secrets are properly configured:

- `supabase-jwt` secret with key `secret` (for JWT signing)
- `realtime-secret` secret with key `secret-key-base` (for encryption)
- `realtime-anon-key` secret with key `ANON_KEY` (for anonymous access)

#### 3. Verify Environment Variables
The Realtime deployment should have these environment variables:

```yaml
- name: API_JWT_SECRET
  valueFrom:
    secretKeyRef:
      name: supabase-jwt
      key: secret
- name: JWT_SECRET
  valueFrom:
    secretKeyRef:
      name: supabase-jwt
      key: secret
- name: JWT_EXPIRY
  value: "3600"
- name: JWT_DEFAULT_GROUP_NAME
  value: "authenticated"
- name: JWT_AUD
  value: "authenticated"
```

#### 4. Fix Base64 Padding Issues
If the JWT secret has padding issues, you can fix them:

```bash
# Remove existing padding
secret_without_padding=$(echo "$JWT_SECRET" | sed 's/==$//' | sed 's/=$//')

# Add correct padding
if echo "${secret_without_padding}=" | base64 -d >/dev/null 2>&1; then
    fixed_secret="${secret_without_padding}="
elif echo "${secret_without_padding}==" | base64 -d >/dev/null 2>&1; then
    fixed_secret="${secret_without_padding}=="
fi
```

#### 5. Update Kong Configuration
Ensure Kong is properly configured for WebSocket connections:

```yaml
protocols:
  - ws
  - wss
plugins:
  - name: key-auth
    config:
      key_names:
        - apikey
        - x-api-key
```

### Testing the Fix

1. **Deploy the updated configuration**:
   ```bash
   kubectl apply -f apps/kube/realtime/manifests/
   kubectl apply -f apps/kube/kong/manifests/
   ```

2. **Test the WebSocket connection**:
   ```bash
   # Test with curl (for debugging)
   curl -i -N -H "Connection: Upgrade" \
        -H "Upgrade: websocket" \
        -H "Sec-WebSocket-Version: 13" \
        -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
        -H "apikey: YOUR_API_KEY" \
        "ws://localhost:8086/realtime/v1/"
   ```

3. **Check Realtime logs**:
   ```bash
   kubectl logs -n kilobase -l app=realtime -f
   ```

### Prevention

1. **Always validate JWT secrets** before deployment
2. **Use consistent Base64 encoding** across all services
3. **Test WebSocket connections** in development before production
4. **Monitor Realtime service logs** for early detection of issues

### Additional Resources

- [Supabase Realtime Documentation](https://supabase.com/docs/guides/realtime)
- [JWT.io Debugger](https://jwt.io/#debugger-io)
- [Base64 Decoder](https://www.base64decode.org/)

### Support

If the issue persists after trying these solutions:

1. Check the Realtime service logs for additional error details
2. Verify the JWT token structure using jwt.io
3. Ensure all secrets are properly synchronized across services
4. Consider regenerating JWT secrets if corruption is suspected
