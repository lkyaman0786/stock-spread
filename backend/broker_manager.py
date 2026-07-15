import pyotp
import time
import random
import logging
from typing import Dict, List, Optional

logger = logging.getLogger("broker_manager")

class BrokerSession:
    def __init__(self, broker_name: str, client_id: str, password: str, api_key: str, totp_secret: str):
        self.broker_name = broker_name
        self.client_id = client_id
        self.password = password
        self.api_key = api_key
        self.totp_secret = totp_secret
        self.is_connected = False
        self.orders: List[dict] = []
        self.positions: Dict[str, dict] = {}
        self.totp_code = ""
        self.smart_conn = None # Store real Angel One connection

    def connect(self) -> bool:
        try:
            # 1. Generate active TOTP code
            if self.totp_secret:
                secret = self.totp_secret.replace(" ", "")
                if secret.isdigit() and len(secret) == 6:
                    self.totp_code = secret
                else:
                    try:
                        totp = pyotp.TOTP(secret)
                        self.totp_code = totp.now()
                    except Exception as e:
                        logger.warning(f"Failed to generate TOTP from secret: {e}. Using input as literal code.")
                        self.totp_code = secret
            else:
                self.totp_code = ""

            # 2. Check if Angel One real login is attempted
            if self.broker_name == "Angel One":
                if not self.client_id or not self.password or not self.api_key:
                    raise Exception("Client ID, PIN/Password, and Developer API Key are required for Angel One.")
                
                logger.info(f"Connecting to real Angel One server for {self.client_id}...")
                try:
                    from SmartApi import SmartConnect
                    smart_conn = SmartConnect(api_key=self.api_key)
                    data = smart_conn.generateSession(self.client_id, self.password, self.totp_code)
                    if data and data.get("status") is True:
                        self.smart_conn = smart_conn
                        self.is_connected = True
                        logger.info(f"Successfully connected to real Angel One: {self.client_id}")
                        return True
                    else:
                        err_msg = data.get("message", "API Session Generation Failed")
                        logger.error(f"Angel One real login failed: {err_msg}")
                        raise Exception(err_msg)
                except Exception as e:
                    logger.error(f"Angel One API login crashed: {e}")
                    raise Exception(f"Angel One Login Failed: {str(e)}")
            else:
                # Simulated connection
                time.sleep(0.5)
                self.is_connected = True
                logger.info(f"Successfully connected to {self.broker_name} (Simulated) for client {self.client_id}")
                return True
        except Exception as e:
            logger.error(f"Failed to connect: {e}")
            raise e

    def get_ltp(self, exchange: str, symbol: str, token: str) -> Optional[float]:
        """
        Queries real-time LTP from Angel One if session is active
        """
        if not self.is_connected or not self.smart_conn:
            return None
        try:
            res = self.smart_conn.ltpData(exchange, symbol, token)
            logger.info(f"ltpData API Response for {symbol} ({token}): {res}")
            if res and res.get("status") is True and "data" in res and "ltp" in res["data"]:
                return float(res["data"]["ltp"])
        except Exception as e:
            logger.error(f"Failed to fetch Angel One LTP for {symbol}: {e}")
        return None

    def place_order(self, token: str, symbol: str, transaction_type: str, qty: int, price: float, exchange: str = "NSE", order_type: str = "LIMIT") -> dict:
        """
        Executes real orders on Angel One if connected, otherwise simulates execution.
        """
        order_id = f"ORD-{int(time.time()*1000)}-{random.randint(10, 99)}"
        exec_price = price

        if self.is_connected and self.smart_conn:
            logger.info(f"Placing real Angel One order: {transaction_type} {qty}x {symbol}...")
            try:
                # Variety: "NORMAL"
                # ProductType: "CARRYOVER" for F&O, "DELIVERY" for Cash
                is_fo = exchange in ["NFO", "BFO"]
                product_type = "CARRYOVER" if is_fo else "DELIVERY"
                
                orderparams = {
                    "variety": "NORMAL",
                    "tradingsymbol": symbol,
                    "symboltoken": token,
                    "transactiontype": transaction_type,
                    "exchange": exchange,
                    "ordertype": "MARKET" if order_type == "MARKET" else "LIMIT",
                    "producttype": product_type,
                    "duration": "DAY",
                    "price": price if order_type == "LIMIT" else 0.0,
                    "quantity": qty
                }
                
                res = self.smart_conn.placeOrder(orderparams)
                if res and res.get("status") is True and "data" in res and "orderid" in res["data"]:
                    order_id = res["data"]["orderid"]
                    logger.info(f"Real Angel One order successful! ID: {order_id}")
                    # Fetch LTP to act as exec price
                    current_ltp = self.get_ltp(exchange, symbol, token)
                    if current_ltp:
                        exec_price = current_ltp
                else:
                    err_msg = res.get("message", "Unknown rejection")
                    logger.error(f"Real Angel One order rejected: {err_msg}")
                    raise Exception(err_msg)
            except Exception as e:
                logger.error(f"Real order placement failed: {e}")
                raise e
        else:
            # Calculate execution price with a bit of slippage if simulated
            if order_type == "MARKET":
                slippage = round(random.uniform(-0.05, 0.05) * price / 100, 2)
                exec_price = price + slippage

        order = {
            "order_id": order_id,
            "broker": self.broker_name,
            "client_id": self.client_id,
            "token": token,
            "symbol": symbol,
            "transaction_type": transaction_type, # BUY or SELL
            "qty": qty,
            "price": price,
            "exec_price": exec_price,
            "order_type": order_type,
            "status": "COMPLETE",
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        
        self.orders.append(order)
        
        # Update positions
        pos_key = f"{self.broker_name}:{token}"
        current_pos = self.positions.get(pos_key, {
            "token": token,
            "symbol": symbol,
            "qty": 0,
            "avg_price": 0.0,
            "realized_pnl": 0.0
        })
        
        dir_multiplier = 1 if transaction_type == "BUY" else -1
        new_qty = current_pos["qty"] + (qty * dir_multiplier)
        
        if new_qty == 0:
            if current_pos["qty"] > 0: # Bought then Sold
                pnl = (exec_price - current_pos["avg_price"]) * qty
            else: # Shorted then Bought
                pnl = (current_pos["avg_price"] - exec_price) * qty
            current_pos["realized_pnl"] += pnl
            current_pos["avg_price"] = 0.0
        else:
            if transaction_type == "BUY" and current_pos["qty"] >= 0:
                total_cost = (current_pos["qty"] * current_pos["avg_price"]) + (qty * exec_price)
                current_pos["avg_price"] = round(total_cost / new_qty, 2)
            elif transaction_type == "SELL" and current_pos["qty"] <= 0:
                total_cost = (abs(current_pos["qty"]) * current_pos["avg_price"]) + (qty * exec_price)
                current_pos["avg_price"] = round(total_cost / abs(new_qty), 2)
            
        current_pos["qty"] = new_qty
        self.positions[pos_key] = current_pos
        
        return order

class BrokerManager:
    def __init__(self):
        self.sessions: Dict[str, BrokerSession] = {}

    def estimate_spread_margin(self, legA, legB, qty, ltpA, ltpB) -> float:
        get_val = lambda obj, key: obj.get(key) if isinstance(obj, dict) else getattr(obj, key, None)
        
        lotsizeA = int(get_val(legA, "lotsize") or 1)
        multiplierA = int(get_val(legA, "multiplier") or 1)
        exchA = get_val(legA, "exch_seg") or "NSE"
        instA = get_val(legA, "instrumenttype") or ""
        dirA = get_val(legA, "direction") or "BUY"
        strikeA = float(get_val(legA, "strike") or 0.0)
        
        lotsizeB = int(get_val(legB, "lotsize") or 1)
        multiplierB = int(get_val(legB, "multiplier") or 1)
        exchB = get_val(legB, "exch_seg") or "NSE"
        instB = get_val(legB, "instrumenttype") or ""
        dirB = get_val(legB, "direction") or "BUY"
        strikeB = float(get_val(legB, "strike") or 0.0)
        
        qtyA = qty * lotsizeA * multiplierA
        qtyB = qty * lotsizeB * multiplierB
        
        marginA = 0.0
        if exchA in ["NFO", "BFO"]:
            if instA in ["FUTIDX", "FUTSTK"]:
                marginA = ltpA * qtyA * 0.20
            else:
                if dirA == "SELL":
                    marginA = ltpA * qtyA + (strikeA * qtyA * 0.15)
                else:
                    marginA = ltpA * qtyA
        else:
            marginA = ltpA * qtyA
            
        marginB = 0.0
        if exchB in ["NFO", "BFO"]:
            if instB in ["FUTIDX", "FUTSTK"]:
                marginB = ltpB * qtyB * 0.20
            else:
                if dirB == "SELL":
                    marginB = ltpB * qtyB + (strikeB * qtyB * 0.15)
                else:
                    marginB = ltpB * qtyB
        else:
            marginB = ltpB * qtyB
            
        total_req = marginA + marginB
        if exchA in ["NFO", "BFO"] and exchB in ["NFO", "BFO"]:
            if dirA != dirB:
                total_req *= 0.50
                
        return round(total_req, 2)

    def login(self, broker_name: str, client_id: str, password: str, api_key: str, totp_secret: str) -> dict:
        session_key = f"{broker_name}:{client_id}"
        
        session = BrokerSession(broker_name, client_id, password, api_key, totp_secret)
        try:
            if session.connect():
                self.sessions[session_key] = session
                return {
                    "success": True,
                    "broker": broker_name,
                    "client_id": client_id,
                    "totp_code": session.totp_code,
                    "status": "CONNECTED"
                }
        except Exception as e:
            return {"success": False, "error": str(e)}
        return {"success": False, "error": "Authentication Failed"}

    def get_session(self, broker_name: str, client_id: str) -> Optional[BrokerSession]:
        return self.sessions.get(f"{broker_name}:{client_id}")

    def logout_broker(self, broker_name: str, client_id: str) -> bool:
        session_key = f"{broker_name}:{client_id}"
        if session_key in self.sessions:
            sess = self.sessions[session_key]
            if sess.smart_conn:
                try:
                    sess.smart_conn.terminateSession(client_id)
                except:
                    pass
            del self.sessions[session_key]
            logger.info(f"Logged out session: {session_key}")
            return True
        return False

    def get_all_positions(self) -> List[dict]:
        all_positions = []
        for session in self.sessions.values():
            for pos in session.positions.values():
                if pos["qty"] != 0 or pos["realized_pnl"] != 0:
                    all_positions.append({
                        "broker": session.broker_name,
                        "client_id": session.client_id,
                        **pos
                    })
        return all_positions

    def get_all_orders(self) -> List[dict]:
        all_orders = []
        for session in self.sessions.values():
            all_orders.extend(session.orders)
        all_orders.sort(key=lambda o: o["timestamp"], reverse=True)
        return all_orders

# Singleton instance
broker_db = BrokerManager()
