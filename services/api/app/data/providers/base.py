from abc import ABC, abstractmethod
import pandas as pd

class MarketDataProvider(ABC):
    @abstractmethod
    async def history(self, symbol: str, period: str = "6mo", interval: str = "1d") -> pd.DataFrame:
        raise NotImplementedError

    @abstractmethod
    async def quote(self, symbol: str) -> dict:
        raise NotImplementedError
