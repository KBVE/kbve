from pydantic import TypeAdapter, parse_obj_as

from ..api_connector import APIConnector  # Adjust the import according to your project structure
from ...models.coindesk import CoinDeskAPIResponse  # Make sure to import your Pydantic models

class CoinDeskClient(APIConnector):
    def __init__(self):
        # Initialize with the base URL for the CoinDesk API
        super().__init__("https://api.coindesk.com/v1")

    async def get_current_bitcoin_price(self):
        # Use the get method from APIConnector to fetch the current Bitcoin price
        response = await self.get("bpi/currentprice.json")
        # Parse the response using Pydantic to get a strongly typed Python object
        adapter = TypeAdapter(CoinDeskAPIResponse)
        price_info = adapter.validate_python(response)
        #price_info = parse_obj_as(CoinDeskAPIResponse, response)
        # Return the USD price as a formatted string
        usd_price = price_info.bpi.USD.rate
        return f"The current USD price for Bitcoin is: ${usd_price}"