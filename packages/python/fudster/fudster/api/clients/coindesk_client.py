from pydantic import TypeAdapter, ValidationError
from ..api_connector import APIConnector
from ...models.coindesk import CoinDeskAPIResponse
import logging

logger = logging.getLogger("uvicorn")


class CoinDeskClient(APIConnector):
    """
    A client for fetching Bitcoin price data from the CoinDesk API.
    """

    def __init__(self):
        super().__init__("https://api.coindesk.com/v1")

    async def get_current_bitcoin_price(self):
        """
        Fetches the current Bitcoin price in USD from the CoinDesk API.

        Returns:
            str: A string that states the current USD price of Bitcoin.
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
