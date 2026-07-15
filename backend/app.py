import asyncio
import os
import json
import logging
import random
import time
from typing import Dict, List, Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from scrip_master import scrip_db
from broker_manager import broker_db

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("app")

app = FastAPI(title="NH STOCK SPREAD API")

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models for Client Authentication
class SendOtpRequest(BaseModel):
    phone_number: str
    chat_id: str

class VerifyOtpRequest(BaseModel):
    phone_number: str
    otp: str

# Models
class LoginRequest(BaseModel):
    broker: str
    client_id: str
    password: str = ""   # User's trading PIN/password
    api_key: str = ""    # Developer publisher API key
    totp_secret: str     # 2FA TOTP secret key or direct 6-digit code

class LogoutRequest(BaseModel):
    broker: str
    client_id: str

class OrderRequest(BaseModel):
    broker: str
    client_id: str
    token: str
    symbol: str
    transaction_type: str
    qty: int
    price: float
    order_type: str = "LIMIT"

class LegOrderInfo(BaseModel):
    token: str
    symbol: str
    exch_seg: str
    direction: str
    multiplier: int
    lotsize: int
    instrumenttype: str
    strike: float = 0.0
    brokerKey: str

class SpreadOrderRequest(BaseModel):
    name: str
    legA: LegOrderInfo
    legB: LegOrderInfo
    qty: int
    ltpA: float
    ltpB: float

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIP_MASTER_PATH = os.path.join(BASE_DIR, "OpenAPIScripMaster.json")

@app.on_event("startup")
async def startup_event():
    logger.info("Startup: Loading Scrip Master...")
    loop = asyncio.get_running_loop()
    success = await loop.run_in_executor(None, scrip_db.load, SCRIP_MASTER_PATH)
    if success:
        logger.info("Startup: Scrip Master Loaded Successfully.")
    else:
        logger.error("Startup: Failed to load Scrip Master.")

@app.get("/api/health")
def health():
    return {"status": "ok", "scrip_master_loaded": scrip_db.is_loaded, "total_scrips": len(scrip_db.scrips_list)}

# In-memory OTP store for Client 2FA
otp_store = {}

@app.post("/api/client/send-otp")
def send_otp(req: SendOtpRequest):
    phone = req.phone_number.strip()
    chat_id = req.chat_id.strip()
    
    if not phone or len(phone) < 10:
        raise HTTPException(status_code=400, detail="Invalid phone number. Must be at least 10 digits.")
    if not chat_id:
        raise HTTPException(status_code=400, detail="Telegram Chat ID is required.")
        
    otp = f"{random.randint(100000, 999999)}"
    expires_at = time.time() + 300  # 5 minutes validity
    
    otp_store[phone] = {
        "otp": otp,
        "chat_id": chat_id,
        "expires_at": expires_at
    }
    
    method = os.getenv("CLIENT_2FA_METHOD", "telegram").lower()
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    
    success = False
    error_msg = ""
    
    if method == "telegram" and bot_token:
        # Call Telegram Bot API sendMessage
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": f"🔒 *NH Stock Spread Verification*\n\nYour 2FA Login OTP is: *{otp}*\n\nThis OTP is valid for 5 minutes. Do not share it with anyone.",
            "parse_mode": "Markdown"
        }
        try:
            import requests
            res = requests.post(url, json=payload, timeout=10)
            res_data = res.json()
            if res.status_code == 200 and res_data.get("ok"):
                success = True
                logger.info(f"OTP successfully sent to Chat ID {chat_id} via Telegram Bot.")
            else:
                error_msg = res_data.get("description", "Unknown Telegram error")
                logger.error(f"Telegram Bot API returned error: {error_msg}")
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Failed to call Telegram API: {e}")
    else:
        # Fallback to mock printing
        logger.info(f"\n[SMS MOCK] SENT OTP {otp} TO {phone} (Chat ID: {chat_id})")
        print(f"\n==================================================")
        print(f"[SMS MOCK] PHONE: {phone} | CHAT ID: {chat_id}")
        print(f"[SMS MOCK] OTP CODE: {otp}")
        print(f"==================================================\n")
        success = True
        
    if success:
        return {"success": True, "message": "OTP sent successfully."}
    else:
        raise HTTPException(status_code=500, detail=f"Failed to send OTP: {error_msg}")

@app.post("/api/client/verify-otp")
def verify_otp(req: VerifyOtpRequest):
    phone = req.phone_number.strip()
    otp = req.otp.strip()
    
    if phone not in otp_store:
        raise HTTPException(status_code=400, detail="No OTP requested for this phone number.")
        
    store = otp_store[phone]
    if time.time() > store["expires_at"]:
        if phone in otp_store:
            del otp_store[phone]
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")
        
    if store["otp"] != otp:
        raise HTTPException(status_code=400, detail="Invalid OTP code. Please try again.")
        
    del otp_store[phone]
    session_token = f"sess_{phone}_{int(time.time())}"
    return {
        "success": True,
        "token": session_token,
        "phone_number": phone
    }

@app.get("/api/search")
def search_scrips(q: str = "", limit: int = 50):
    if not scrip_db.is_loaded:
        return {"error": "Scrip master is loading, please try again in a few seconds."}
    results = scrip_db.search(q, limit)
    return {"results": results}

@app.post("/api/broker/login")
def broker_login(req: LoginRequest):
    res = broker_db.login(req.broker, req.client_id, req.password, req.api_key, req.totp_secret)
    if res and res.get("success"):
        return res
    error_msg = res.get("error", "Authentication Failed") if res else "Authentication Failed"
    raise HTTPException(status_code=400, detail=error_msg)

@app.post("/api/broker/logout")
def broker_logout(req: LogoutRequest):
    success = broker_db.logout_broker(req.broker, req.client_id)
    if success:
        return {"success": True}
    raise HTTPException(status_code=400, detail="Failed to log out session")

@app.get("/api/broker/status")
def broker_status():
    connected = []
    for key, sess in broker_db.sessions.items():
        connected.append({
            "broker": sess.broker_name,
            "client_id": sess.client_id,
            "status": "CONNECTED",
            "mode": "REAL" if sess.smart_conn is not None else "SIMULATED"
        })
    return {"connected_brokers": connected}

@app.get("/api/broker/orders")
def get_orders():
    return {"orders": broker_db.get_all_orders()}

@app.get("/api/broker/positions")
def get_positions():
    return {"positions": broker_db.get_all_positions()}

@app.post("/api/broker/positions/reset")
def reset_positions():
    for sess in broker_db.sessions.values():
        sess.orders = []
        sess.positions = {}
    return {"status": "success", "message": "All orders and positions reset."}

@app.post("/api/broker/order")
def place_order(req: OrderRequest):
    sess = broker_db.get_session(req.broker, req.client_id)
    if not sess:
        raise HTTPException(status_code=400, detail=f"No active session for broker {req.broker} and client {req.client_id}. Please login first.")
    
    try:
        order = sess.place_order(
            token=req.token,
            symbol=req.symbol,
            transaction_type=req.transaction_type,
            qty=req.qty,
            price=req.price,
            exchange=sess.positions.get(f"{sess.broker_name}:{req.token}", {}).get("exchange", "NSE") or "NSE", # standard
            order_type=req.order_type
        )
        return {"success": True, "order": order}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/broker/spread-order")
def place_spread_order(req: SpreadOrderRequest):
    # 1. Resolve sessions for both legs
    try:
        brokerA, clientA = req.legA.brokerKey.split(":", 1)
        brokerB, clientB = req.legB.brokerKey.split(":", 1)
    except:
        # Fallback to default simulation broker if not linked
        brokerA, clientA = "Simulator", "Guest"
        brokerB, clientB = "Simulator", "Guest"
        
    sessA = broker_db.get_session(brokerA, clientA)
    sessB = broker_db.get_session(brokerB, clientB)
    
    # Auto-login fallback for simulation mode if needed
    if not sessA:
        broker_db.login(brokerA, clientA, "", "", "")
        sessA = broker_db.get_session(brokerA, clientA)
    if not sessB:
        broker_db.login(brokerB, clientB, "", "", "")
        sessB = broker_db.get_session(brokerB, clientB)
        
    if not sessA or not sessB:
        raise HTTPException(status_code=400, detail="Active execution account session not found.")
        
    # 2. Check funds/margin for both legs together
    req_funds = broker_db.estimate_spread_margin(req.legA, req.legB, req.qty, req.ltpA, req.ltpB)
    
    if sessA.smart_conn:
        try:
            res = sessA.smart_conn.rmsLimit()
            if res and res.get("status") is True and "data" in res and "availablemargin" in res["data"]:
                avail = float(res["data"]["availablemargin"])
                if avail < req_funds:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Insufficient Funds! Required Spread Margin: ₹{req_funds:,.2f}, Available Margin: ₹{avail:,.2f}"
                    )
        except HTTPException as he:
            raise he
        except Exception as e:
            logger.error(f"rmsLimit failed: {e}")
    else:
        # Simulation margin check
        mock_limit = 500000.0
        if req_funds > mock_limit:
            raise HTTPException(
                status_code=400, 
                detail=f"Insufficient Funds (Simulated)! Required Margin: ₹{req_funds:,.2f}, Available: ₹{mock_limit:,.2f}"
            )

    # 3. Funds verified! Execute both legs!
    try:
        # Place Leg A order
        qtyA = req.qty * req.legA.lotsize * req.legA.multiplier
        orderA = sessA.place_order(
            token=req.legA.token,
            symbol=req.legA.symbol,
            transaction_type=req.legA.direction,
            qty=qtyA,
            price=req.ltpA,
            exchange=req.legA.exch_seg,
            order_type="MARKET"
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Leg A Order Failed: {str(e)}")
        
    try:
        # Place Leg B order
        qtyB = req.qty * req.legB.lotsize * req.legB.multiplier
        orderB = sessB.place_order(
            token=req.legB.token,
            symbol=req.legB.symbol,
            transaction_type=req.legB.direction,
            qty=qtyB,
            price=req.ltpB,
            exchange=req.legB.exch_seg,
            order_type="MARKET"
        )
    except Exception as e:
        # Crucial alert: Leg A succeeded, but Leg B failed
        raise HTTPException(
            status_code=400, 
            detail=f"Leg A Succeeded, but Leg B Failed: {str(e)}. PLEASE CHECK POSITION SODA IMMEDIATELY!"
        )
        
    return {
        "success": True, 
        "message": f"Placed Spread Order successfully! Lots: {req.qty}",
        "orderA": orderA, 
        "orderB": orderB, 
        "req_funds": req_funds
    }

# Active websocket connections
class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        await websocket.send_json(message)

ws_manager = ConnectionManager()

# Helper to generate base price for a token
def get_base_price(token: str, scrip: dict) -> float:
    name = scrip.get("name", "").upper()
    exch_seg = scrip.get("exch_seg", "NSE")
    inst_type = scrip.get("instrumenttype", "")
    
    popular_prices = {
        "WIPRO": 507.0,
        "INOXWIND": 88.63,
        "TATASTEEL": 175.50,
        "RELIANCE": 2930.0,
        "HDFCBANK": 1680.0,
        "INFY": 1560.0,
        "ICICIBANK": 1160.0,
        "ITC": 435.0,
        "SBIN": 840.0,
        "TCS": 3820.0,
        "BHARTIARTL": 1420.0,
        "LT": 3520.0,
        "AXISBANK": 1210.0,
        "KFINTECH": 313.0,
        "PAYTM": 410.0,
        "SENSEX": 77000.0,
        "BANKNIFTY": 50500.0,
        "NIFTY": 23500.0,
        "FINNIFTY": 21000.0,
        "MIDCPNIFTY": 12000.0
    }
    
    underlying_hash = sum(ord(c) for c in name)
    underlying_price = popular_prices.get(name)
    if underlying_price is None:
        underlying_price = float((underlying_hash % 400) + 75.0)
        
    if exch_seg in ["NFO", "BFO"]:
        # Derivatives
        if inst_type in ["FUTIDX", "FUTSTK"]:
            # Future trades slightly above cash index/stock price
            return round(underlying_price + 2.50, 2)
        elif inst_type in ["OPTIDX", "OPTSTK"]:
            # Options premium depends on strike price vs underlying
            strike_str = scrip.get("strike", "0")
            try:
                strike = float(strike_str) / 100.0 if "." not in strike_str else float(strike_str)
                # If strike is too large or too small, fallback
                if strike > underlying_price * 3 or strike < underlying_price / 3:
                    strike = strike / 100.0
            except:
                strike = underlying_price
            
            diff = underlying_price - strike
            if "CE" in scrip.get("symbol", "") or "CALL" in scrip.get("symbol", ""):
                premium = max(1.5, diff + 15.0)
            else:
                premium = max(1.5, -diff + 15.0)
            return round(premium, 2)
        else:
            return round(underlying_price, 2)
    else:
        # Cash equity
        return round(underlying_price, 2)

@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    
    subscribed_tokens: Set[str] = set()
    current_prices: Dict[str, float] = {}
    
    async def fetch_token_data(token: str):
        if ":" in token:
            exch_seg, raw_token = token.split(":", 1)
            scrip = scrip_db.get_by_key(exch_seg, raw_token)
        else:
            raw_token = token
            scrip = scrip_db.get_by_token(token)
            
        if not scrip:
            return None
            
        exch_seg = scrip.get("exch_seg", "NSE")
        symbol = scrip.get("symbol", "")
        
        real_ltp = None
        loop = asyncio.get_running_loop()
        for key, session in list(broker_db.sessions.items()):
            if session.is_connected and session.smart_conn:
                real_ltp = await loop.run_in_executor(None, session.get_ltp, exch_seg, symbol, raw_token)
                if real_ltp:
                    break
        
        if real_ltp is not None:
            new_price = real_ltp
            current_prices[raw_token] = new_price
            base = real_ltp
        else:
            if raw_token not in current_prices:
                current_prices[raw_token] = get_base_price(raw_token, scrip)
            
            prev_price = current_prices[raw_token]
            pct_range = 0.0035 if scrip.get("instrumenttype") in ["OPTIDX", "OPTSTK"] else 0.0015
            pct_change = random.uniform(-pct_range, pct_range)
            new_price = prev_price * (1 + pct_change)
            base = get_base_price(raw_token, scrip)
        
        try:
            tick_size = float(scrip.get("tick_size", "0.05"))
            if scrip.get("instrumenttype") in ["OPTIDX", "OPTSTK", "FUTIDX", "FUTSTK"] or scrip.get("exch_seg") in ["NFO", "BFO"]:
                tick_size = 0.05
        except:
            tick_size = 0.05
            
        new_price = round(round(new_price / tick_size) * tick_size, 2)
        current_prices[raw_token] = new_price
        
        change = new_price - base
        change_pct = (change / base) * 100.0 if base > 0 else 0.0
        
        return raw_token, {
            "token": raw_token,
            "symbol": symbol,
            "ltp": new_price,
            "change": round(change, 2),
            "change_pct": round(change_pct, 2),
            "bid": round(new_price - tick_size, 2),
            "ask": round(new_price + tick_size, 2),
            "timestamp": time.strftime("%H:%M:%S")
        }

    async def stream_loop():
        try:
            while True:
                if not subscribed_tokens:
                    await asyncio.sleep(0.5)
                    continue
                
                tasks = [fetch_token_data(t) for t in list(subscribed_tokens)]
                results = await asyncio.gather(*tasks)
                
                ticks = {}
                for res in results:
                    if res:
                        raw_token, tick_data = res
                        ticks[raw_token] = tick_data
                
                if ticks:
                    await ws_manager.send_personal_message({"type": "ticks", "data": ticks}, websocket)
                
                await asyncio.sleep(0.5)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Error in stream loop: {e}")

    stream_task = asyncio.create_task(stream_loop())
    
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            
            action = msg.get("action")
            tokens = msg.get("tokens", [])
            
            if action == "subscribe":
                for token in tokens:
                    subscribed_tokens.add(token)
                logger.info(f"WS Subscribed to: {tokens}")
                
                # Immediate stream values
                immediate_ticks = {}
                for token in tokens:
                    if ":" in token:
                        exch_seg, raw_token = token.split(":", 1)
                        scrip = scrip_db.get_by_key(exch_seg, raw_token)
                    else:
                        raw_token = token
                        scrip = scrip_db.get_by_token(token)
                        
                    if scrip:
                        exch_seg = scrip.get("exch_seg", "NSE")
                        symbol = scrip.get("symbol", "")
                        
                        # Try real ltp
                        real_ltp = None
                        for key, session in list(broker_db.sessions.items()):
                            if session.is_connected and session.smart_conn:
                                real_ltp = session.get_ltp(exch_seg, symbol, raw_token)
                                if real_ltp:
                                    break
                                    
                        if real_ltp is not None:
                            ltp = real_ltp
                            base = real_ltp
                        else:
                            if raw_token not in current_prices:
                                current_prices[raw_token] = get_base_price(raw_token, scrip)
                            ltp = current_prices[raw_token]
                            base = get_base_price(raw_token, scrip)
                            
                        immediate_ticks[raw_token] = {
                            "token": raw_token,
                            "symbol": symbol,
                            "ltp": ltp,
                            "change": round(ltp - base, 2),
                            "change_pct": round(((ltp - base) / base) * 100.0, 2) if base > 0 else 0.0,
                            "bid": ltp - 0.05,
                            "ask": ltp + 0.05,
                            "timestamp": time.strftime("%H:%M:%S")
                        }
                if immediate_ticks:
                    await ws_manager.send_personal_message({"type": "ticks", "data": immediate_ticks}, websocket)
                    
            elif action == "unsubscribe":
                for token in tokens:
                    if token in subscribed_tokens:
                        subscribed_tokens.remove(token)
                logger.info(f"WS Unsubscribed from: {tokens}")
                
    except WebSocketDisconnect:
        logger.info("WS Client Disconnected")
    finally:
        stream_task.cancel()
        ws_manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
