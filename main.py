import os
import time
import threading
import http.server
import socketserver
import random
import requests
import json
import numpy as np
import pandas as pd
from datetime import datetime

# --- 1. PERSISTENCE LAYER ---
class PersistenceManager:
    FILE_NAME = "bot_memory.json"
    
    @staticmethod
    def save(state_dict):
        try:
            with open(PersistenceManager.FILE_NAME, "w") as f:
                json.dump(state_dict, f)
        except Exception as e:
            print(f"[ERROR] Failed to save memory: {e}")

    @staticmethod
    def load():
        if os.path.exists(PersistenceManager.FILE_NAME):
            try:
                with open(PersistenceManager.FILE_NAME, "r") as f:
                    return json.load(f)
            except Exception as e:
                print(f"[ERROR] Failed to load memory: {e}")
        return None

# --- 2. SHARED STATE ---
class BotState:
    logs = []
    watchlist = [] 
    positions = []
    
    def __init__(self):
        saved_data = PersistenceManager.load()
        if saved_data:
            self.watchlist = saved_data.get("watchlist", [])
            self.positions = saved_data.get("positions", [])
            self.add_log("💾 [SYSTEM] MEMORY RECOVERED.", "SYSTEM")
        else:
            self.add_log("🆕 [SYSTEM] NO MEMORY FOUND. Starting fresh.", "SYSTEM")

    def save_state(self):
        data = { "watchlist": self.watchlist, "positions": self.positions }
        PersistenceManager.save(data)
    
    def add_log(self, msg, category="SYSTEM"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{category}] {msg}", flush=True)
        self.logs.append({"timestamp": timestamp, "message": msg, "category": category})
        if len(self.logs) > 100: self.logs.pop(0)

state = BotState()

# --- 3. GAMMA API CLIENT (THE EYES) ---
class GammaClient:
    def __init__(self):
        self.base_url = "https://gamma-api.polymarket.com/events"
        self.params = {"slug": "presidential-election-winner-2024"}
        self.last_known_price = 0.50 # Fallback

    def get_trump_price(self):
        try:
            # Fetch the specific event for US Election
            r = requests.get(self.base_url, params=self.params, timeout=5)
            if r.status_code == 200:
                data = r.json()
                if data:
                    markets = data[0].get('markets', [])
                    for m in markets:
                        # Find the Donald Trump specific market
                        # Checking Title or specific question logic
                        if "Donald Trump" in m.get('groupItemTitle', ''):
                            # outcomePrices is usually a string array ["0.55", "0.45"]
                            outcomes = json.loads(m.get('outcomePrices', '["0.5","0.5"]'))
                            self.last_known_price = float(outcomes[0]) # Assuming Index 0 is YES
                            return self.last_known_price
            return self.last_known_price
        except Exception as e:
            # Silent fail to logs to keep loop running
            return self.last_known_price

# --- 4. API SERVER ---
class APIHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/status':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            data = {
                "logs": state.logs,
                "watchlist": state.watchlist,
                "positions": state.positions
            }
            self.wfile.write(json.dumps(data).encode())
        else:
            self.send_response(404)
            self.end_headers()

def start_api_server():
    PORT = int(os.getenv("PORT", 8080))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), APIHandler) as httpd:
        state.add_log(f"API Server listening on port {PORT}", "SYSTEM")
        httpd.serve_forever()

threading.Thread(target=start_api_server, daemon=True).start()

# --- 5. RISK ENGINE (KELLY) ---
class RiskManager:
    def __init__(self):
        self.KELLY_FRACTION = 0.5
        self.MAX_BANKROLL_PCT = 0.20
    
    def calculate_bet_size(self, bankroll, win_prob, odds):
        b = odds - 1
        if b <= 0: return 0
        p = win_prob
        q = 1 - p
        kelly_pct = (b * p - q) / b
        safe_pct = kelly_pct * self.KELLY_FRACTION
        final_pct = min(safe_pct, self.MAX_BANKROLL_PCT)
        return max(0, bankroll * final_pct)

# --- 6. TRIBUNAL SCORER ---
class TribunalScorer:
    def calculate_score(self, trade_history):
        if not trade_history: return {'score': 0, 'status': 'NO_DATA'}
        df = pd.DataFrame(trade_history)
        df['pnl'] = (df['exit_price'] - df['entry_price']) * df['size']
        df['roi'] = (df['exit_price'] - df['entry_price']) / df['entry_price']
        total_vol = df['size'].sum()
        total_pnl = df['pnl'].sum()
        wash_ratio = total_vol / (abs(total_pnl) + 1)
        if wash_ratio > 500: return {'score': 0, 'status': 'REJECTED_WASH_TRADING'}
        neg_ret = df[df['roi'] < 0]['roi']
        downside = neg_ret.std() if len(neg_ret) > 0 else 0.01
        sortino = df['roi'].mean() / downside if downside > 0 else 0
        raw_score = (min(sortino, 3) / 3) * 60 + 40 
        return {'score': round(raw_score, 2), 'status': 'APPROVED' if raw_score > 70 else 'REJECTED'}

# --- 7. MOCK GENERATOR (STILL USED FOR SCANNER SIM) ---
class ProfileGenerator:
    @staticmethod
    def generate():
        trades = []
        mode = random.choice(['GOD', 'REKT', 'MID'])
        for _ in range(20):
            entry = random.uniform(0.3, 0.7)
            if mode == 'GOD': exit_p = entry * random.uniform(1.1, 1.8)
            elif mode == 'REKT': exit_p = entry * random.uniform(0.1, 0.9)
            else: exit_p = entry * random.uniform(0.8, 1.2)
            trades.append({'entry_price': entry, 'exit_price': exit_p, 'size': random.uniform(100, 1000)})
        return trades

# --- 8. MAIN ENGINE (UPDATED) ---
class DiscoveryEngine:
    def __init__(self):
        self.risk = RiskManager()
        self.tribunal = TribunalScorer()
        self.gamma = GammaClient() # <--- NEW: Real Data Client
        self.bankroll = 10000
        state.add_log("v2.7.0 GAMMA ENGINE ONLINE", "SYSTEM")
        
    def run(self):
        while True:
            # 1. UPDATE MARKET DATA (REAL)
            trump_price = self.gamma.get_trump_price()
            
            # 2. UPDATE ACTIVE POSITIONS
            for pos in state.positions:
                if pos['market'] == "Trump 2024 Election Winner":
                    # Update current price and PnL based on REAL market data
                    pos['currentPrice'] = trump_price
                    # PnL calc: (Current Value - Cost Basis)
                    # Shares = Size / EntryPrice
                    shares = pos['size'] / pos['entryPrice']
                    current_value = shares * trump_price
                    pos['pnl'] = round(current_value - pos['size'], 2)
                    pos['roi'] = round((trump_price - pos['entryPrice']) / pos['entryPrice'], 4)

            # 3. SCANNER (Simulated Whale Discovery)
            if random.random() > 0.8:
                candidate = f"0x{random.randint(1000,9999)}...{random.randint(1000,9999)}"
                state.add_log(f"⚖️ [TRIBUNAL] Convening court for {candidate}...", "SCANNER")
                history = ProfileGenerator.generate()
                result = self.tribunal.calculate_score(history)
                if result['status'] == 'APPROVED':
                    score = result['score']
                    state.add_log(f"✅ [APPROVED] Score: {score}. Adding to Watchlist.", "SCANNER")
                    state.watchlist.append({'address': candidate, 'scoreA': score, 'pnl': 0})
                    if len(state.watchlist) > 8: state.watchlist.pop(0)
                    state.save_state()
                else:
                    state.add_log(f"❌ [REJECTED] Reason: {result['status']}", "SCANNER")
            
            # 4. EXECUTION (Using REAL Price)
            if len(state.watchlist) > 0 and random.random() > 0.7:
                whale = random.choice(state.watchlist)
                # Odds are now derived from REAL price (1 / price)
                real_odds = 1 / max(trump_price, 0.01)
                prob = whale['scoreA'] / 100
                
                size = self.risk.calculate_bet_size(self.bankroll, prob, real_odds)
                
                if size > 10:
                    state.add_log(f"🔴 LIVE SIGNAL: {whale['address']} bought 'Trump Winner' @ {trump_price}", "EXECUTION")
                    
                    state.positions.append({
                        "id": str(int(time.time())),
                        "market": "Trump 2024 Election Winner",
                        "whale": whale['address'],
                        "side": "YES",
                        "entryPrice": trump_price,   # <--- REAL ENTRY PRICE
                        "currentPrice": trump_price, # <--- REAL CURRENT PRICE
                        "size": round(size, 2),
                        "pnl": 0,
                        "roi": 0,
                        "timestamp": int(time.time() * 1000)
                    })
                    state.save_state()
            
            time.sleep(2)

if __name__ == "__main__":
    bot = DiscoveryEngine()
    bot.run()
