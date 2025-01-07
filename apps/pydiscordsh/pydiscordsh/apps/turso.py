import logging
logger = logging.getLogger("uvicorn")

class TursoDatabase:
    async def start_client(self):
        return {"status": 200, "message": "Client started successfully."}

    async def stop_client(self):
        return {"status": 200, "message": "Client stopped successfully."}

    async def status_client(self):
        return {"status": 200, "message": "Client is running."}
    
    async def close(self):
        logger.info("Closing the database connection.")
        return {"status": 200, "message": "Database connection closed."}