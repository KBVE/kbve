import logging

logger = logging.getLogger("uvicorn")

class Health:
    def __init__(self, db):
        self.db = db

    async def start_client(self):
        """Start the database client."""
        try:
            if self.db.conn is not None:
                logger.warning("Attempted to start client, but connection already exists.")
                return {"status": 400, "message": "Client already started."}
            
            self.db.initialize_connection()
            logger.info("Database client started.")
            return {"status": 200, "message": "Client started successfully."}
        except Exception as e:
            logger.error(f"Error starting client: {e}")
            return {"status": 500, "message": f"Error starting client: {e}"}

    async def stop_client(self):
        """Stop the database client."""
        try:
            if self.db.conn:
                self.db.conn = None
                logger.info("Database client stopped.")
                return {"status": 200, "message": "Client stopped successfully."}
            else:
                return {"status": 400, "message": "No active client to stop."}
        except Exception as e:
            logger.error(f"Error stopping client: {e}")
            return {"status": 500, "message": f"Error stopping client: {e}"}

    async def status_client(self):
        """Check the status of the database client."""
        if self.db.conn:
            return {"status": 200, "message": "Client is running."}
        else:
            return {"status": 400, "message": "Client is not running."}