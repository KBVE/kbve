import logging
import os
import libsql_experimental as libsql

logger = logging.getLogger("uvicorn")

class TursoDatabase:
    def __init__(self):
        self.conn = None

    def initialize_connection(self):
        """Initialize the database connection."""
        url = os.getenv("TURSO_DATABASE_URL")
        auth_token = os.getenv("TURSO_AUTH_TOKEN")

        if not url or not auth_token:
            raise ValueError("TURSO_DATABASE_URL or TURSO_AUTH_TOKEN is not set in environment variables.")
        
        # Initialize the database connection
        self.conn = libsql.connect("hello.db", sync_url=url, auth_token=auth_token)
        self.conn.sync()
        logger.info("Database connection initialized.")

    async def start_client(self):
        try:
             # Check if the connection already exists
            if self.conn is not None:
                logger.warning("Attempted to start client, but connection already exists.")
                return {"status": 400, "message": "Client already started."}
            
            self.initialize_connection()
            logger.info("Database client started.")
            return {"status": 200, "message": "Client started successfully."}
        except Exception as e:
            logger.error(f"Error starting client: {e}")
            return {"status": 500, "message": f"Error starting client: {e}"}
        
    async def stop_client(self):
        try:
            if self.conn:
                self.conn = None
                logger.info("Database client stopped.")
                return {"status": 200, "message": "Client stopped successfully."}
            else:
                return {"status": 400, "message": "No active client to stop."}
        except Exception as e:
            logger.error(f"Error stopping client: {e}")
            return {"status": 500, "message": f"Error stopping client: {e}"}

    async def status_client(self):
        if self.conn:
            return {"status": 200, "message": "Client is running."}
        else:
            return {"status": 400, "message": "Client is not running."}
    
    async def close(self):
        try:
            if self.conn:
                self.conn = None
                logger.info("Closing the database connection.")
                return {"status": 200, "message": "Database connection closed."}
            else:
                return {"status": 400, "message": "No active connection to close."}
        except Exception as e:
            logger.error(f"Error closing the database connection: {e}")
            return {"status": 500, "message": f"Error closing the database connection: {e}"}
        
    async def sync(self):
        """Sync the database."""
        try:
            if self.conn:
                self.conn.sync()
                logger.info("Database synced successfully.")
                return {"status": 200, "message": "Database synced successfully."}
            else:
                return {"status": 400, "message": "No active connection to sync."}
        except Exception as e:
            logger.error(f"Error syncing the database: {e}")
            return {"status": 500, "message": f"Error syncing the database: {e}"}

    def get_cursor(self):
        """Get a cursor for executing SQL queries."""
        try:
            if not self.conn:
                raise ValueError("No active database connection.")
            cursor = self.conn.cursor()
            logger.info("Cursor obtained successfully.")
            return cursor
        except Exception as e:
            logger.error(f"Error getting the database cursor: {e}")
            raise