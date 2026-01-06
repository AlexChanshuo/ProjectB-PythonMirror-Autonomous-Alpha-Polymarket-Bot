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

# --- 1. SHARED STATE (THE UPLINK) ---
class BotState:
    logs = []
    watchlist = [] 
    positions = []
    
    def add_log(self, msg, category="SYSTEM"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        # Console print for Zeabur logs
        print(f"[{category}] {msg}", flush=True)
        # Memory store for React Frontend
        self.logs.append({"timestamp": timestamp, "message": msg, "category": category})
        if len(self.logs) > 100: self.logs.pop(0)

state = BotState()

# --- 2. API SERVER ---
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

# --- 3. RISK ENGINE (KELLY) ---
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

# --- 4. TRIBUNAL SCORER (THE BRAIN) ---
class TribunalScorer:
    def calculate_score(self, trade_history):
        if not trade_history: return {'score': 0, 'status': 'NO_DATA'}
        
        df = pd.DataFrame(trade_history)
        df['pnl'] = (df['exit_price'] - df['entry_price']) * df['size']
        df['roi'] = (df['exit_price'] - df['entry_price']) / df['entry_price']
        
        # Wash Trading Check
        total_vol = df['size'].sum()
        total_pnl = df['pnl'].sum()
        wash_ratio = total_vol / (abs(total_pnl) + 1)
        if wash_ratio > 500:
            return {'score': 0, 'status': 'REJECTED_WASH_TRADING'}
            
        # Sortino Ratio
        neg_ret = df[df['roi'] < 0]['roi']
        downside = neg_ret.std() if len(neg_ret) > 0 else 0.01
        sortino = df['roi'].mean() / downside if downside > 0 else 0
        
        # Final Score
        raw_score = (min(sortino, 3) / 3) * 60 + 40 # Base 40 + up to 60 for skill
        return {'score': round(raw_score, 2), 'status': 'APPROVED' if raw_score > 70 else 'REJECTED'}

# --- 5. PROFILE GENERATOR (SIMULATION) ---
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
            trades.append({
                'entry_price': entry, 
                'exit_price': exit_p, 
                'size': random.uniform(100, 1000)
            })
        return trades

# --- 6. MAIN ENGINE ---
class DiscoveryEngine:
    def __init__(self):
        self.risk = RiskManager()
        self.tribunal = TribunalScorer()
        self.bankroll = 10000
        state.add_log("v3.1.0 HYBRID ENGINE ONLINE", "SYSTEM")
        
    def run(self):
        while True:
            # A. SCANNER
            if random.random() > 0.7:
                candidate = f"0x{random.randint(1000,9999)}...{random.randint(1000,9999)}"
                state.add_log(f"⚖️ [TRIBUNAL] Convening court for {candidate}...", "SCANNER")
                
                history = ProfileGenerator.generate()
                result = self.tribunal.calculate_score(history)
                
                if result['status'] == 'APPROVED':
                    score = result['score']
                    state.add_log(f"✅ [APPROVED] Score: {score}. Adding to Watchlist.", "SCANNER")
                    state.watchlist.append({'address': candidate, 'scoreA': score, 'pnl': 0})
                    if len(state.watchlist) > 8: state.watchlist.pop(0)
                else:
                    state.add_log(f"❌ [REJECTED] Reason: {result['status']}", "SCANNER")
            
            # B. TRADING
            if len(state.watchlist) > 0 and random.random() > 0.6:
                whale = random.choice(state.watchlist)
                odds = random.uniform(1.5, 3.0)
                prob = whale['scoreA'] / 100
                size = self.risk.calculate_bet_size(self.bankroll, prob, odds)
                
                if size > 10:
                    state.add_log(f"🔴 LIVE SIGNAL: {whale['address']} bought 'Trump Winner'...", "EXECUTION")
                    state.add_log(f"[KELLY] Size: ${size:.2f} (Prob: {prob:.2f}, Odds: {odds:.2f})", "EXECUTION")
                    
                    # Add to positions for frontend
                    state.positions.append({
                        "id": str(int(time.time())),
                        "market": "Trump 2024 Election Winner",
                        "whale": whale['address'],
                        "side": "YES",
                        "entryPrice": 0.55,
                        "currentPrice": 0.55,
                        "size": round(size, 2),
                        "pnl": 0,
                        "roi": 0,
                        "timestamp": int(time.time() * 1000)
                    })
            
            time.sleep(2)

if __name__ == "__main__":
    bot = DiscoveryEngine()
    bot.run()
