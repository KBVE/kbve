from pydantic import BaseModel, Field
from typing import Dict

class TimeInfo(BaseModel):
    updated: str
    updatedISO: str
    updateduk: str

class CurrencyInfo(BaseModel):
    code: str
    symbol: str
    rate: str
    description: str
    rate_float: float

class BitcoinPriceIndex(BaseModel):
    USD: CurrencyInfo
    GBP: CurrencyInfo
    EUR: CurrencyInfo

class CoinDeskAPIResponse(BaseModel):
    time: TimeInfo
    disclaimer: str
    chartName: str = Field(..., alias="chartName")
    bpi: BitcoinPriceIndex