from fastapi import FastAPI, HTTPException
from notification_bot.routes.dependencies import lifespan
from notification_bot.api.cors import CORS
from notification_bot.api.supabase import get_supabase_client


app = FastAPI(lifespan=lifespan)

CORS(app)

@app.get("/")
async def hello_world():
    return {"message": "Hello World"}

@app.get("/test-vault")
async def test_vault():
    """Test endpoint to fetch the specific vault secret"""
    secret_id = "e3b91ce2-c2d4-484c-a362-f652397d0522"
    try:
        client = get_supabase_client()
        
        # Use RPC to call vault functions - try different approaches
        # Method 1: Try vault_get_secret if it exists
        try:
            result = client.rpc("vault_get_secret", {"secret_id": secret_id}).execute()
            print(f"Method 1 (vault_get_secret) result: {result}")
        except Exception as e:
            print(f"Method 1 failed: {e}")
            
            # Method 2: Try read_secret
            try:
                result = client.rpc("read_secret", {"id": secret_id}).execute()
                print(f"Method 2 (read_secret) result: {result}")
            except Exception as e2:
                print(f"Method 2 failed: {e2}")
                
                # Method 3: Try get_decrypted_secret
                try:
                    result = client.rpc("get_decrypted_secret", {"secret_id": secret_id}).execute()
                    print(f"Method 3 (get_decrypted_secret) result: {result}")
                except Exception as e3:
                    print(f"Method 3 failed: {e3}")
                    
                    # Method 4: Try direct table access if vault functions don't work
                    # This would need a public view or function that exposes vault data
                    result = None
                    print("All vault RPC methods failed")
        
        if result and result.data:
            secret_data = result.data if isinstance(result.data, dict) else result.data[0] if len(result.data) > 0 else None
            if secret_data:
                print(f"Vault secret for ID {secret_id}:")
                print(f"  Full data: {secret_data}")
                return {"status": "success", "secret": secret_data}
        else:
            print(f"No secret found with ID: {secret_id}")
            return {"status": "not_found", "message": f"No secret found with ID: {secret_id}"}
            
    except Exception as e:
        print(f"Error fetching vault secret: {e}")
        raise HTTPException(status_code=500, detail=str(e))
