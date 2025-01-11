import os
import jwt
import time
from supabase import create_client, Client
from jwt import ExpiredSignatureError, InvalidTokenError

class Kilobase:
    def __init__(self):
        """Initialize the Supabase client and JWT secret."""
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
        self.jwt_secret = os.getenv("JWT_SECRET") or "default_secret"

        if not self.supabase_url or not self.supabase_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in the environment variables.")

        self.client: Client = create_client(self.supabase_url, self.supabase_key)
    
    def issue_jwt(self, user_id: str, expires_in: int = 3600) -> str:
        """
        Issue a JWT for a given user.
        
        Args:
            user_id (str): The user ID to include in the token.
            expires_in (int): Token expiration time in seconds. Default is 1 hour.

        Returns:
            str: The generated JWT token.
        """
        payload = {
            "sub": user_id,
            "exp": int(time.time()) + expires_in,
            "iat": int(time.time())
        }
        token = jwt.encode(payload, self.jwt_secret, algorithm="HS256")
        return token

    def verify_jwt(self, token: str) -> dict:
        """
        Verify a JWT token.

        Args:
            token (str): The JWT token to verify.

        Returns:
            dict: Decoded payload if the token is valid.

        Raises:
            ValueError: If the token is expired or invalid.
        """
        try:
            decoded = jwt.decode(token, self.jwt_secret, algorithms=["HS256"])
            return decoded
        except ExpiredSignatureError:
            raise ValueError("Token has expired.")
        except InvalidTokenError:
            raise ValueError("Invalid token.")

    def verify_admin_jwt(self, token: str) -> dict:
        """Verify if the JWT belongs to an admin user."""
        decoded = self.verify_jwt(token)
        if not decoded.get("admin"):
            raise ValueError("Admin access required.")
        return decoded

    def get_user_by_id(self, user_id: str):
        """
        Fetch a user's data from the Supabase `user_profiles` table.

        Args:
            user_id (str): The user ID to query.

        Returns:
            dict: User data or None if not found.
        """
        response = self.client.table("user_profiles").select("*").eq("id", user_id).single().execute()
        return response.data if response.data else None
    
    def extract_user_id(self, token: str) -> str:
        """
        Extract the user ID (UUID) from a Supabase JWT token.
        
        Args:
            token (str): The JWT token to decode.
            
        Returns:
            str: The user's unique ID (UUID) if valid.

        Raises:
            ValueError: If the token is expired or invalid.
        """
        try:
            # Decode the Supabase token using the Supabase key
            payload = jwt.decode(token, self.supabase_key, algorithms=["HS256"])
            
            # Supabase stores the user ID under 'sub' (subject) claim
            user_id = payload.get("sub")
            if not user_id:
                raise ValueError("User ID not found in the token.")
            return user_id

        except ExpiredSignatureError:
            raise ValueError("Token has expired.")
        except InvalidTokenError:
            raise ValueError("Invalid token.")
        except Exception as e:
            raise ValueError(f"Token verification error: {e}")
        

    def health_status(self) -> dict:
        """
        Check the health status of the Supabase connection.

        Returns:
            dict: A dictionary containing the status and a message.
        """
        try:
            # Attempt a simple query to check the connection health
            response = self.client.table("user_profiles").select("id").limit(1).execute()
            
            # Check if the response is valid
            if response.data is not None:
                return {"status": "healthy", "message": "Supabase connection is active."}
            else:
                return {"status": "unhealthy", "message": "Failed to fetch data from Supabase."}

        except Exception as e:
            # Return an error status if the connection test fails
            return {"status": "unhealthy", "message": f"Error: {str(e)}"}