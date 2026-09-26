import asyncio
from fastapi import APIRouter,WebSocket,WebSocketDisconnect
from app.data.providers.yahoo import YahooFinanceProvider
router=APIRouter(tags=["stream"])
provider=YahooFinanceProvider()

@router.websocket("/ws/quote/{symbol}")
async def quote_stream(websocket:WebSocket,symbol:str):
    await websocket.accept()
    try:
        while True:
            try:
                quote=await provider.quote(symbol.upper())
                await websocket.send_json(quote)
            except Exception as exc:
                await websocket.send_json({"error":str(exc)})
            await asyncio.sleep(10)
    except (WebSocketDisconnect,asyncio.CancelledError):
        return
