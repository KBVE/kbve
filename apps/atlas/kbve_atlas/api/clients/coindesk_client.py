from pydantic import TypeAdapter, ValidationError
from ..api_connector import APIConnector
from ...models.coindesk import CoinDeskAPIResponse
import logging

# Configure logger to use uvicorn's logger settings
logger = logging.getLogger("uvicorn")

class CoinDeskClient(APIConnector):
    """
    A client for fetching Bitcoin price data from the CoinDesk API.
    
    This client extends the generic APIConnector to provide methods
    specifically tailored for accessing Bitcoin data from CoinDesk's API.
    
    Methods:
        get_current_bitcoin_price: Asynchronously retrieves the current price of Bitcoin
        in USD and returns a formatted string.
    """
    
    def __init__(self):
        """
        Initializes the CoinDeskClient instance by setting the base URL for the CoinDesk API.
        """
        super().__init__("https://api.coindesk.com/v1")

    async def get_current_bitcoin_price(self):
        """
        Fetches the current Bitcoin price in USD from the CoinDesk API.
        
        Asynchronously sends a GET request to the CoinDesk API to retrieve the current
        price index for Bitcoin and formats it into a user-friendly string.
        
        Returns:
            str: A string that states the current USD price of Bitcoin.
            
        Example:
            "The current USD price for Bitcoin is: $1234.56"
            
        Raises:
            ValidationError: If the response from the CoinDesk API cannot be validated.
            HTTPException: If the request to the CoinDesk API fails.
        """
        response = await self.get("bpi/currentprice.json")
        adapter = TypeAdapter(CoinDeskAPIResponse)
        try:
            price_info = adapter.validate_python(response)
        except ValidationError as ve:
            logger.error(f"Validation error while parsing the API response: {ve}")
            raise
        usd_price = price_info.bpi.USD.rate
        return f"The current USD price for Bitcoin is: ${usd_price}"
