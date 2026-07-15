import json
import os
import logging
from typing import List, Dict, Optional

logger = logging.getLogger("scrip_master")
logging.basicConfig(level=logging.INFO)

class ScripMaster:
    def __init__(self):
        self.scrips_by_token: Dict[str, dict] = {}
        self.scrips_by_key: Dict[str, dict] = {}
        self.scrips_list: List[dict] = []
        self.is_loaded = False

    def load(self, file_path: str):
        if not os.path.exists(file_path):
            logger.error(f"Scrip master file not found at {file_path}")
            return False
        
        try:
            logger.info(f"Loading scrip master from {file_path}...")
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            if isinstance(data, list):
                self.scrips_list = data
            elif isinstance(data, dict):
                # Sometimes scrip master can be key-value or wrapped in an object
                self.scrips_list = data.get("scrips", []) if "scrips" in data else list(data.values())
            else:
                self.scrips_list = []
                
            self.scrips_by_token = {}
            self.scrips_by_key = {}
            for s in self.scrips_list:
                token = s.get("token")
                exch_seg = s.get("exch_seg")
                if token:
                    self.scrips_by_token[token] = s
                    if exch_seg:
                        self.scrips_by_key[f"{exch_seg}:{token}"] = s
                        
            self.is_loaded = True
            logger.info(f"Successfully loaded {len(self.scrips_list)} scrips.")
            return True
        except Exception as e:
            logger.exception(f"Error loading scrip master: {e}")
            return False

    def search(self, query: str, limit: int = 50) -> List[dict]:
        if not query:
            return []
        
        query_upper = query.upper()
        query_parts = query_upper.split()
        results = []
        
        # Detect if user is specifically searching for F&O contracts
        fo_keywords = ["CE", "PE", "FUT", "OPT", "CALL", "PUT", "NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX", "MIDCPNIFTY"]
        has_digit = any(char.isdigit() for char in query_upper)
        is_fo_search = any(k in query_upper for k in fo_keywords) or has_digit
        
        # Primary search: match name/symbol starts with or contains
        for scrip in self.scrips_list:
            symbol = scrip.get("symbol", "").upper()
            name = scrip.get("name", "").upper()
            
            # All search parts must match either the symbol or name
            match = True
            for part in query_parts:
                if part not in symbol and part not in name:
                    match = False
                    break
            
            if match:
                results.append(scrip)
                if len(results) >= limit * 4: # get a larger pool to sort
                    break
        
        # Sort results:
        # 1. Exact match on symbol
        # 2. Prioritize NFO/BFO if is_fo_search is True, otherwise NSE/BSE cash
        # 3. Shortest symbol length first
        def sort_key(s):
            sym = s.get("symbol", "")
            seg = s.get("exch_seg", "")
            inst = s.get("instrumenttype", "")
            
            exact_score = 0 if sym.upper() == query_parts[0] else 1
            
            if is_fo_search:
                # Prioritize derivative segments
                segment_score = 0 if seg in ["NFO", "BFO"] else 1
                instrument_score = 0 if inst in ["OPTIDX", "OPTSTK", "FUTIDX", "FUTSTK"] else 1
            else:
                # Prioritize cash segments
                segment_score = 0 if seg in ["NSE", "BSE"] else 1
                instrument_score = 0 if inst in ["", "EQUITY"] else 1
            
            return (exact_score, segment_score, instrument_score, len(sym))

        results.sort(key=sort_key)
        return results[:limit]

    def get_by_token(self, token: str) -> Optional[dict]:
        return self.scrips_by_token.get(token)

    def get_by_key(self, key_or_segment: str, token: Optional[str] = None) -> Optional[dict]:
        if token is not None:
            key = f"{key_or_segment}:{token}"
        else:
            key = key_or_segment
        return self.scrips_by_key.get(key)

# Singleton instance
scrip_db = ScripMaster()
