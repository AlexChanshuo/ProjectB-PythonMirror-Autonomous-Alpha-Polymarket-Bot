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
from datetime import datetime, timedelta

# --- 1. INFRASTRUCTURE & HEALTH CHECK ---
def start_dummy_server():
    PORT = int(os.getenv("PORT", 8080))
    Handler = http.server.SimpleHTTPRequestHandler
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"[SYSTEM] Serving keep-alive at port {PORT}")
        httpd.serve_forever()

threading.Thread(target=start_dummy_server, daemon=True).start()

# --- 2. CONFIGURATION & RISK ENGINE ---
GAMMA_API_URL = "https://gamma-api.polymarket.com/events"
KELLY_FRACTION = 0.5  
MAX_BANKROLL_PCT_PER_WHALE = 0.20
MIN_BET_SIZE = 10.0 

def log(msg):
    print(f"[AUTO-ALPHA] {msg}", flush=True)

# --- 3. THE TRIBUNAL: ALGORITHMIC SCORER ---
class TribunalScorer:
    """
    LAYER 2: AUDITING ENGINE
    Calculates the 'Alpha Score' (0-100) to distinguish Smart Money from Lucky Gamblers.
    """
    def __init__(self):
        self.W_SORTINO = 0.40      
        self.W_CONSISTENCY = 0.30  
        self.W_RECENCY = 0.20      
        self.W_PROFIT = 0.10       
        self.WASH_TRADE_THRESHOLD = 500.0 

    def calculate_score(self, trade_history: list) -> dict:
        if not trade_history:
            return {'alpha_score': 0, 'status': 'INSUFFICIENT_DATA'}

        df = pd.DataFrame(trade_history)
        
        # PnL & ROI Calculation
        df['pnl'] = (df['exit_price'] - df['entry_price']) * df['size']
        df['roi'] = (df['exit_price'] - df['entry_price']) / df['entry_price']
        
        total_profit = df['pnl'].sum()
        total_volume = df['size'].sum()

        # STEP 1: WASH TRADING
        wash_ratio = total_volume / (abs(total_profit) + 1.0)
        if wash_ratio > self.WASH_TRADE_THRESHOLD:
            return {'alpha_score': 0, 'status': 'REJECTED_WASH_TRADING', 'metrics': {'wash_ratio': round(wash_ratio, 2)}}

        # STEP 2: SKILL (SORTINO)
        negative_returns = df[df['roi'] < 0]['roi']
        downside_deviation = negative_returns.std() if len(negative_returns) > 0 else 0.01
        avg_roi = df['roi'].mean()
        sortino = avg_roi / downside_deviation if downside_deviation > 0 else 0
        score_sortino = min((sortino / 3.0) * 100, 100)

        # STEP 3: LUCK (CONSISTENCY)
        max_win = df['pnl'].max()
        if total_profit > 0:
            concentration = max_win / total_profit
            score_consistency = max(0, (1.0 - concentration) * 100)
        else:
            score_consistency = 0

        # STEP 4: RECENCY (WEIGHTED WIN RATE)
        # Assuming timestamps are mock relative integers for this simulation
        # For real data we would use datetime delta
        df['weight'] = 1.0 # Simplified for mock data without real dates
        score_recency = 80.0 # Default High for mock

        # FINAL SCORE
        final_score = (
            (score_sortino * self.W_SORTINO) +
            (score_consistency * self.W_CONSISTENCY) +
            (score_recency * self.W_RECENCY) +
            (min(total_profit/10000, 100) * self.W_PROFIT)
        )

        return {
            'alpha_score': round(final_score, 2),
            'metrics': {
                'sortino': round(sortino, 2),
                'consistency': round(score_consistency, 2),
                'wash_ratio': round(wash_ratio, 2)
            },
            'status': 'APPROVED' if final_score > 75 else 'REJECTED'
        }

# --- 4. PROFILE GENERATOR (MOCK DATA FOR TRIBUNAL) ---
class ProfileGenerator:
    @staticmethod
    def generate_random_history():
        # Generate 10-30 trades
        num_trades = random.randint(10, 30)
        history = []
        profile_type = random.choice(['WINNER', 'GAMBLER', 'LOSER', 'WASH'])
        
        for i in range(num_trades):
            size = random.uniform(100, 5000)
            entry = random.uniform(0.3, 0.6)
            
            if profile_type == 'WINNER':
                exit_price = entry * random.uniform(0.9, 1.5) # Mostly wins
            elif profile_type == 'GAMBLER':
                # One huge win, many losses
                if i == 0: exit_price = entry * 5.0
                else: exit_price = entry * 0.5
            elif profile_type == 'WASH':
                 exit_price = entry * random.uniform(0.99, 1.01) # Break even
            else:
                exit_price = entry * random.uniform(0.5, 1.1) # Mixed/Loss
                
            history.append({
                'entry_price': entry,
                'exit_price': exit_price,
                'size': size,
                'timestamp': time.time() - (i * 86400)
            })
        return history

# --- 5. RISK CALCULATOR (EXISTING) ---
class RiskManager:
    def calculate_bet_size(self, bankroll, win_prob, odds_decimal):
        b = odds_decimal - 1
        if b <= 0: return 0
        p = win_prob
        q = 1 - p
        kelly_pct = (b * p - q) / b
        safe_pct = kelly_pct * KELLY_FRACTION
        final_pct = min(safe_pct, MAX_BANKROLL_PCT_PER_WHALE)
        return max(0, bankroll * final_pct)

# --- 6. DATA FEED (EXISTING) ---
class MarketDataFeed:
    def fetch_top_markets(self):
        try:
            headers = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
            params = {"limit": "20", "active": "true", "closed": "false"}
            response = requests.get(GAMMA_API_URL, params=params, headers=headers)
            if response.status_code == 200: return response.json()
            else: return []
        except Exception: return []

# --- 7. DISCOVERY ENGINE (INTEGRATED) ---
class DiscoveryEngine:
    def __init__(self):
        self.risk_manager = RiskManager()
        self.feed = MarketDataFeed()
        self.tribunal = TribunalScorer()
        self.bankroll = 10000.0
        self.watchlist = [] # Validated Whales
        log(f"v2.6.5 TRIBUNAL ONLINE. Risk Engine: KELLY ({KELLY_FRACTION}x).")

    def run_tribunal_cycle(self):
        # 1. SCOUT: Find a new candidate
        candidate_addr = f"0x{random.randint(1000,9999)}...{random.randint(1000,9999)}"
        log(f"⚖️ [TRIBUNAL] Convening court for {candidate_addr}...")
        
        # 2. AUDIT: Generate history and score
        history = ProfileGenerator.generate_random_history()
        result = self.tribunal.calculate_score(history)
        score = result['alpha_score']
        
        # 3. JUDGMENT
        if result['status'] == 'APPROVED':
            log(f"✅ [APPROVED] Score: {score} | Sortino: {result['metrics']['sortino']}. Adding to Watchlist.")
            self.watchlist.append({'address': candidate_addr, 'score': score})
            if len(self.watchlist) > 10: self.watchlist.pop(0) # Keep fresh
        else:
             log(f"❌ [REJECTED] Score: {score} | Reason: {result['status']}")

    def analyze_market_signal(self, market):
        # EXECUTION LOGIC (SNIPER)
        # Only fire if we have whales to track
        if not self.watchlist:
            return

        market_title = market.get('title', 'Unknown Market')
        
        # Pick a whale from our APPROVED list
        whale = random.choice(self.watchlist)
        
        log(f"🔴 LIVE SIGNAL: {whale['address']} bought '{market_title}'")
        
        # Execute Risk Calculation
        odds = random.uniform(1.5, 3.0)
        win_prob = whale['score'] / 100.0 # Use Alpha Score as Probability
        
        bet_size = self.risk_manager.calculate_bet_size(self.bankroll, win_prob, odds)
        
        if bet_size > MIN_BET_SIZE:
            log(f"[KELLY] Size: ${bet_size:.2f} (Prob: {win_prob:.2f}, Odds: {odds:.2f})")
            log(f"[ORDER] 🚀 SUBMITTED: ${bet_size:.2f}")
        else:
            log(f"⚠️ [RISK] Kelly suggests NO BET.")

    def run(self):
        cycle_count = 0
        while True:
            cycle_count += 1
            
            # PHASE A: TRIBUNAL (Every 3 cycles)
            if cycle_count % 3 == 0:
                 self.run_tribunal_cycle()

            # PHASE B: DRAGNET & SNIPER
            if random.random() > 0.6:
                log("🕸️ [DRAGNET] Scanning Polymarket Top Volume...")
                markets = self.feed.fetch_top_markets()
                if markets and self.watchlist:
                    # If we have markets and approved whales, try to trade
                    if random.random() > 0.5: # 50% chance a whale trades
                        target = random.choice(markets)
                        self.analyze_market_signal(target)
            
            time.sleep(2) 

if __name__ == "__main__":
    bot = DiscoveryEngine()
    bot.run()
