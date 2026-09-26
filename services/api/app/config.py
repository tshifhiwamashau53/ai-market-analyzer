from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = "AI Market Analyzer API"
    environment: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    frontend_url: str = "http://localhost:3000"
    redis_url: str = "redis://localhost:6379/0"
    database_url: str = "postgresql+asyncpg://market_user:market_password@localhost:5432/market_analyzer"
    yahoo_finance_enabled: bool = True
    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    alpha_vantage_api_key: str = ""
    news_api_key: str = ""
    finnhub_api_key: str = ""
    model_device: str = "cpu"
    model_cache_dir: str = "./models"
    forecast_horizon: int = 7
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

@lru_cache
def get_settings() -> Settings:
    return Settings()
