import json
from redis.asyncio import Redis

class Cache:
    def __init__(self, url: str):
        self.client = Redis.from_url(url, decode_responses=True)

    async def get_json(self, key: str):
        value = await self.client.get(key)
        return json.loads(value) if value else None

    async def set_json(self, key: str, value, ttl: int = 30):
        await self.client.set(key, json.dumps(value, default=str), ex=ttl)

    async def ping(self) -> bool:
        try:
            return bool(await self.client.ping())
        except Exception:
            return False

    async def close(self):
        await self.client.aclose()
