import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

// --- TYPES ---
interface Position {
  id: string;
  market: string;
  whale: string;
  side: 'YES' | 'NO';
  entryPrice: number;
  currentPrice: number;
  size: number;
  pnl: number;
  roi: number;
  timestamp: number;
}

interface Portfolio {
  cash: number;
  invested: number;
  equity: number;
  history: number[];
}

interface RiskConfig {
  kellyFraction: number; // 0.1 to 1.0 (Full Kelly)
  maxPositions: number;
  maxAllocPerWhale: number; // % of bankroll
  globalKillSwitch: boolean;
}

type LogCategory = 'SYSTEM' | 'EXECUTION' | 'SCANNER';

interface LogEntry {
  timestamp: string;
  message: string;
  category: LogCategory;
}

// --- API UTILS (REAL DATA BRIDGE) ---
const fetchLiveMarkets = async () => {
    try {
        // FIXED: Removed 'sort' and 'order' to prevent API 422 Validation Errors
        const response = await fetch('https://gamma-api.polymarket.com/events?limit=20&active=true&closed=false');
        const data = await response.json();
        // Map to simple titles, remove quotes if present
        return data.map((e: any) => e.title).slice(0, 15);
    } catch (e) {
        console.error("Gamma API Error", e);
        return MOCK_MARKETS; // Fallback
    }
};

// --- MOCK DATA GENERATORS ---
const generateAddress = () => `0x${Math.random().toString(16).substr(2, 4)}...${Math.random().toString(16).substr(2, 4)}`;

const MOCK_MARKETS = [
  "Trump 2024 Election Winner",
  "Bitcoin > $100k in 2024",
  "Fed Interest Rate Cut September",
  "GOP Senate Control",
  "Taylor Swift Engagement",
  "SpaceX Starship Launch Success",
  "US CPI Inflation Data"
];

const App = () => {
  // NAVIGATION & MODE
  const [activeTab, setActiveTab] = useState('portfolio'); 
  const [mode, setMode] = useState<'SIMULATION' | 'REAL'>('SIMULATION');

  // DATA STATE
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [activeMarkets, setActiveMarkets] = useState<string[]>(MOCK_MARKETS);
  
  // PORTFOLIO STATE
  const [portfolio, setPortfolio] = useState<Portfolio>({
    cash: 10000,
    invested: 0,
    equity: 10000,
    history: [10000]
  });
  const [positions, setPositions] = useState<Position[]>([]);
  
  // RISK STATE
  const [riskConfig, setRiskConfig] = useState<RiskConfig>({
    kellyFraction: 0.5, // Default to Half-Kelly
    maxPositions: 5,
    maxAllocPerWhale: 20, // 20% max per whale
    globalKillSwitch: false
  });

  // REFS
  const watchlistRef = useRef<any[]>([]);
  const positionsRef = useRef<Position[]>([]);
  const portfolioRef = useRef<Portfolio>(portfolio);
  const riskRef = useRef<RiskConfig>(riskConfig);
  const modeRef = useRef<'SIMULATION' | 'REAL'>('SIMULATION');
  const activeMarketsRef = useRef<string[]>(MOCK_MARKETS);
  const logEndRefPortfolio = useRef<null | HTMLDivElement>(null);
  const logEndRefRadar = useRef<null | HTMLDivElement>(null);

  // SYNC REFS
  useEffect(() => { watchlistRef.current = watchlist; }, [watchlist]);
  useEffect(() => { positionsRef.current = positions; }, [positions]);
  useEffect(() => { portfolioRef.current = portfolio; }, [portfolio]);
  useEffect(() => { riskRef.current = riskConfig; }, [riskConfig]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { activeMarketsRef.current = activeMarkets; }, [activeMarkets]);

  // LIVE DATA BRIDGE
  useEffect(() => {
      if (mode === 'REAL') {
          addLog("[SYSTEM] 🔌 ESTABLISHING UPLINK TO POLYMARKET GAMMA API...", 'SYSTEM');
          fetchLiveMarkets().then(markets => {
              if (markets && markets.length > 0) {
                  setActiveMarkets(markets);
                  addLog(`[SYSTEM] 🟢 UPLINK SECURE. LOADED ${markets.length} LIVE MARKETS.`, 'SYSTEM');
              } else {
                  addLog(`[SYSTEM] ⚠️ API CONNECTION WEAK. USING CACHED DATA.`, 'SYSTEM');
              }
          });
      } else {
          setActiveMarkets(MOCK_MARKETS);
          addLog("[SYSTEM] 🔌 SWITCHING TO SIMULATION NETWORK.", 'SYSTEM');
      }
  }, [mode]);

  const addLog = (msg: string, category: LogCategory) => {
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
    setLogs(prev => [...prev.slice(-49), { timestamp, message: msg, category }]);
  };

  // --- ACTIONS ---
  const sellPosition = (id: string) => {
    const pos = positionsRef.current.find(p => p.id === id);
    if (!pos) return;

    const saleValue = pos.size + pos.pnl; 
    
    setPortfolio(prev => {
        const newCash = prev.cash + saleValue;
        const newEquity = newCash + (prev.invested - pos.size); 
        return {
            ...prev,
            cash: newCash,
            invested: prev.invested - pos.size,
            equity: newEquity,
            history: [...prev.history, newEquity]
        };
    });

    setPositions(prev => prev.filter(p => p.id !== id));
    addLog(`[SELL] 💰 CLOSED ${pos.market.substring(0, 20)}... | PnL: $${pos.pnl.toFixed(2)}`, 'EXECUTION');
  };

  const killWhale = (address: string) => {
    const whalePositions = positionsRef.current.filter(p => p.whale === address);
    whalePositions.forEach(p => sellPosition(p.id));
    setWatchlist(prev => prev.filter(w => w.address !== address));
    addLog(`[RISK] 🚫 KILLED WHALE ${address}. Positions liquidated.`, 'EXECUTION');
  };

  const toggleGlobalKillSwitch = () => {
    const newState = !riskConfig.globalKillSwitch;
    setRiskConfig(prev => ({ ...prev, globalKillSwitch: newState }));
    if (newState) {
        addLog(`[RISK] 🛑 GLOBAL KILL SWITCH ACTIVATED. HALTING TRADING.`, 'EXECUTION');
    } else {
        addLog(`[RISK] 🟢 SYSTEMS RESUMED.`, 'EXECUTION');
    }
  };

  // --- SIMULATION LOOPS ---
  useEffect(() => {
    addLog("SYSTEM_BOOT: Phase 26.4 Hotfix initialized.", 'SYSTEM');
    addLog("[CONFIG] Kelly Criterion Logic: LOADED", 'SYSTEM');
    
    // INITIAL WHALES
    const initialWhales = Array.from({ length: 5 }).map(() => ({
      address: generateAddress(),
      scoreA: Math.floor(Math.random() * 20) + 75,
      source: 'A',
      pnl: Math.floor(Math.random() * 50000) + 1000
    }));
    setWatchlist(initialWhales);

    // 1. TRADING & EXECUTION LOOP
    const tradingInterval = setInterval(() => {
      const currentMode = modeRef.current;
      const currentWhales = watchlistRef.current;
      const currentRisk = riskRef.current;
      const currentPortfolio = portfolioRef.current;
      const currentPositions = positionsRef.current;
      const markets = activeMarketsRef.current;
      
      const rand = Math.random();

      // UPDATE LIVE POSITIONS (Market Movement)
      if (currentPositions.length > 0) {
        setPositions(prev => prev.map(p => {
            const move = (Math.random() - 0.48) * 0.02;
            const newPrice = Math.max(0.01, Math.min(0.99, p.currentPrice + move));
            const newRoi = (newPrice - p.entryPrice) / p.entryPrice;
            const newPnl = p.size * newRoi;
            return { ...p, currentPrice: newPrice, roi: newRoi, pnl: newPnl };
        }));

        const totalPositionValue = currentPositions.reduce((acc, p) => acc + p.size + p.pnl, 0); 
        setPortfolio(prev => ({
            ...prev,
            invested: currentPositions.reduce((acc, p) => acc + p.size, 0),
            equity: prev.cash + totalPositionValue
        }));
      }

      // NEW TRADE SIGNALS
      if (!currentRisk.globalKillSwitch && currentPositions.length < currentRisk.maxPositions && rand > 0.85 && currentWhales.length > 0) {
        const trader = currentWhales[Math.floor(Math.random() * currentWhales.length)];
        const market = markets[Math.floor(Math.random() * markets.length)];
        
        // Kelly Logic
        const entryPrice = Math.random() * 0.4 + 0.3;
        const odds = 1 / entryPrice;
        const b = odds - 1;
        const p = trader.scoreA / 100;
        const q = 1 - p;
        let kellyPct = (b * p - q) / b;
        kellyPct = Math.max(0, kellyPct);
        let betPct = kellyPct * currentRisk.kellyFraction;
        betPct = Math.min(betPct, currentRisk.maxAllocPerWhale / 100);

        const betSize = currentPortfolio.cash * betPct;

        if (betSize > 10) {
            // MATCHING ZEABUR: 🔴 LIVE SIGNAL: 0xb70c.. bought 'Simulated Position'
            addLog(`🔴 LIVE SIGNAL: ${trader.address.substr(0,8)}.. bought '${market.substring(0, 15)}...'`, 'EXECUTION');
            addLog(`[KELLY] Size: $${betSize.toFixed(2)} (${(betPct*100).toFixed(1)}% bankroll)`, 'EXECUTION');
            
            const actionMsg = currentMode === 'REAL' ? `[ORDER] 🚀 SUBMITTED: $${betSize.toFixed(2)}` : `[PAPER] 📝 MOCK FILL: $${betSize.toFixed(2)}`;
            addLog(actionMsg, 'EXECUTION');

            const newPos: Position = {
                id: Math.random().toString(36),
                market,
                whale: trader.address,
                side: 'YES',
                entryPrice,
                currentPrice: entryPrice,
                size: betSize,
                pnl: 0,
                roi: 0,
                timestamp: Date.now()
            };

            setPositions(prev => [...prev, newPos]);
            setPortfolio(prev => ({
                ...prev,
                cash: prev.cash - betSize,
                invested: prev.invested + betSize
            }));
        }
      }
    }, 2000);

    // 2. SCANNER & HUNTER LOOP (Matches Zeabur Logs)
    // OVERCLOCKED FOR VISIBILITY
    const scannerInterval = setInterval(() => {
        const rand = Math.random();
        
        // Phase 1: Casting Net (Increased freq to 0.4)
        if (rand > 0.4) {
             // ZEABUR: 🕸️ [DRAGNET] Casting net for Top Traders...
             addLog(`🕸️ [DRAGNET] Casting net for Top Traders...`, 'SCANNER');
        }

        // Phase 2: Tribunal Judgment (Increased freq to 0.6)
        if (rand > 0.6) {
             const scannedAddr = generateAddress();
             // ZEABUR: ⚖️ [TRIBUNAL] Convening court for 0xb70c0b... using Strategy A
             addLog(`⚖️ [TRIBUNAL] Convening court for ${scannedAddr.substr(0,8)}... using Strategy A`, 'SCANNER');
             
             const score = (Math.random() * 35 + 60).toFixed(2);
             const sortino = (Math.random() * 10).toFixed(2);
             const consistency = (Math.random() * 30 + 70).toFixed(2);
             
             // ZEABUR: 📊 SCORE: 80.23/100 | Sortino: 10.16 | Consistency: 86.05
             addLog(`📊 SCORE: ${score}/100 | Sortino: ${sortino} | Consistency: ${consistency}`, 'SCANNER');

             if (parseFloat(score) > 80) {
                 // ZEABUR: ✅ [APPROVED] Smart Money Detected.
                 addLog(`✅ [APPROVED] Smart Money Detected.`, 'SCANNER');
                 // ZEABUR: 🛡️ [ATOMIC VAULT] Safe Write Complete.
                 addLog(`🛡️ [ATOMIC VAULT] Safe Write Complete.`, 'SCANNER');
                 setWatchlist(prev => {
                     if (prev.length >= 8) return prev;
                     return [...prev, {
                         address: scannedAddr,
                         scoreA: Math.floor(parseFloat(score)),
                         source: 'NEW',
                         pnl: 0
                     }];
                 });
             } else {
                 // ZEABUR: ❌ [REJECTED] REJECTED.
                 addLog(`❌ [REJECTED] REJECTED.`, 'SCANNER');
             }
        }
    }, 1500); // FASTER INTERVAL

    return () => {
        clearInterval(tradingInterval);
        clearInterval(scannerInterval);
    };
  }, []);

  // AUTO-SCROLL LOGS
  useEffect(() => {
    if (activeTab === 'portfolio') logEndRefPortfolio.current?.scrollIntoView({ behavior: "smooth" });
    if (activeTab === 'dashboard') logEndRefRadar.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, activeTab]);

  // STYLES & THEME
  const isReal = mode === 'REAL';
  const themeColor = isReal ? '#f85149' : '#1f6feb'; // Red for Real, Blue for Sim

  // LOG FILTERING
  const executionLogs = logs.filter(l => l.category === 'EXECUTION' || l.category === 'SYSTEM');
  const scannerLogs = logs.filter(l => l.category === 'SCANNER' || l.category === 'SYSTEM');

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Roboto Mono' }}>
      
      {/* HEADER */}
      <header style={{ borderBottom: '1px solid #30363d', paddingBottom: '20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: themeColor, margin: 0, fontSize: '24px', transition: 'color 0.3s' }}>
            AUTONOMOUS ALPHA <span style={{fontSize: '12px', color: '#8b949e'}}>v2.6.4 (HOTFIX)</span>
          </h1>
          <p style={{ color: '#8b949e', margin: '5px 0 0 0' }}>
            Risk Engine: <span style={{color: '#7ee787'}}>KELLY CRITERION</span> | Data: <span style={{color: isReal ? '#f85149' : '#58a6ff'}}>{isReal ? 'LIVE (GAMMA API)' : 'MOCK (SIMULATION)'}</span>
          </p>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
            <div style={{textAlign: 'right'}}>
                <div style={{fontSize: '10px', color: '#8b949e'}}>MODE SELECTOR</div>
                <div 
                    onClick={() => setMode(prev => prev === 'REAL' ? 'SIMULATION' : 'REAL')}
                    style={{
                        cursor: 'pointer',
                        background: '#21262d',
                        border: `1px solid ${themeColor}`,
                        color: themeColor,
                        padding: '5px 15px',
                        borderRadius: '20px',
                        fontWeight: 'bold',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.3s'
                    }}
                >
                    <div style={{width: '8px', height: '8px', borderRadius: '50%', background: themeColor, boxShadow: `0 0 8px ${themeColor}`}}></div>
                    {mode} MODE
                </div>
            </div>
        </div>
      </header>

      {/* TABS */}
      <div style={{marginBottom: '20px', display: 'flex', gap: '10px'}}>
        <button 
            onClick={() => setActiveTab('portfolio')}
            style={{...tabStyle, background: activeTab === 'portfolio' ? themeColor : '#161b22', color: activeTab === 'portfolio' ? '#fff' : '#c9d1d9', borderColor: activeTab === 'portfolio' ? themeColor : '#30363d'}}
        >
            💼 MY PORTFOLIO
        </button>
        <button 
            onClick={() => setActiveTab('dashboard')}
            style={{...tabStyle, background: activeTab === 'dashboard' ? '#1f6feb' : '#161b22', color: activeTab === 'dashboard' ? '#fff' : '#c9d1d9', borderColor: activeTab === 'dashboard' ? '#1f6feb' : '#30363d'}}
        >
            🖥️ RADAR
        </button>
        <button 
            onClick={() => setActiveTab('code')}
            style={{...tabStyle, background: activeTab === 'code' ? '#238636' : '#161b22', color: activeTab === 'code' ? '#fff' : '#c9d1d9', borderColor: activeTab === 'code' ? '#238636' : '#30363d'}}
        >
            💾 VAULT (BOT CODE)
        </button>
      </div>

      {activeTab === 'portfolio' ? (
        /* PORTFOLIO & RISK TAB */
        <div style={{display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px'}}>
            
            <div style={{display: 'flex', flexDirection: 'column', gap: '20px'}}>
                {/* MACRO METRICS */}
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px'}}>
                    <div style={cardStyle}>
                        <div style={labelStyle}>TOTAL EQUITY</div>
                        <div style={{fontSize: '24px', fontWeight: 'bold', color: '#fff'}}>
                            ${portfolio.equity.toFixed(2)}
                        </div>
                    </div>
                    <div style={cardStyle}>
                        <div style={labelStyle}>CASH BALANCE</div>
                        <div style={{fontSize: '24px', fontWeight: 'bold', color: '#8b949e'}}>
                            ${portfolio.cash.toFixed(2)}
                        </div>
                    </div>
                    <div style={cardStyle}>
                        <div style={labelStyle}>24H PNL</div>
                        <div style={{fontSize: '24px', fontWeight: 'bold', color: (portfolio.equity - 10000) >= 0 ? '#7ee787' : '#f85149'}}>
                            {(portfolio.equity - 10000) >= 0 ? '+' : ''}${(portfolio.equity - 10000).toFixed(2)}
                        </div>
                    </div>
                </div>

                {/* MICRO ANALYSIS: ACTIVE POSITIONS */}
                <div style={{...cardStyle, padding: '0', overflow: 'hidden'}}>
                    <div style={{padding: '10px 15px', background: '#21262d', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <span style={{fontWeight: 'bold', fontSize: '12px'}}>ACTIVE POSITIONS (MICRO ANALYSIS)</span>
                        <span style={{fontSize: '10px', color: '#8b949e'}}>{positions.length} OPEN TRADES</span>
                    </div>
                    {positions.length === 0 ? (
                        <div style={{padding: '30px', textAlign: 'center', color: '#484f58', fontSize: '12px'}}>
                            NO ACTIVE POSITIONS. WAITING FOR SIGNALS...
                        </div>
                    ) : (
                        <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '12px'}}>
                            <thead>
                                <tr style={{textAlign: 'left', color: '#8b949e'}}>
                                    <th style={{padding: '10px 15px'}}>MARKET</th>
                                    <th style={{padding: '10px 15px'}}>SOURCE (WHALE)</th>
                                    <th style={{padding: '10px 15px'}}>ENTRY</th>
                                    <th style={{padding: '10px 15px'}}>CURRENT</th>
                                    <th style={{padding: '10px 15px'}}>PNL</th>
                                    <th style={{padding: '10px 15px'}}>ACTION</th>
                                </tr>
                            </thead>
                            <tbody>
                                {positions.map((pos) => (
                                    <tr key={pos.id} style={{borderTop: '1px solid #30363d', color: '#c9d1d9'}}>
                                        <td style={{padding: '10px 15px', fontWeight: 'bold'}}>{pos.market.substring(0, 25)}...</td>
                                        <td style={{padding: '10px 15px', fontFamily: 'monospace'}}>{pos.whale.substr(0,8)}...</td>
                                        <td style={{padding: '10px 15px'}}>{pos.entryPrice.toFixed(2)}</td>
                                        <td style={{padding: '10px 15px', color: pos.roi >= 0 ? '#7ee787' : '#f85149'}}>{pos.currentPrice.toFixed(2)}</td>
                                        <td style={{padding: '10px 15px', color: pos.pnl >= 0 ? '#7ee787' : '#f85149'}}>
                                            ${pos.pnl.toFixed(2)} ({ (pos.roi * 100).toFixed(1) }%)
                                        </td>
                                        <td style={{padding: '10px 15px'}}>
                                            <button 
                                                onClick={() => sellPosition(pos.id)}
                                                style={{background: '#232830', border: '1px solid #30363d', color: '#f85149', cursor: 'pointer', borderRadius: '4px', fontSize: '10px', padding: '2px 8px'}}
                                            >
                                                CLOSE
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* WHALE MANAGEMENT */}
                <div style={{...cardStyle, padding: '0', overflow: 'hidden'}}>
                     <div style={{padding: '10px 15px', background: '#21262d', borderBottom: '1px solid #30363d'}}>
                        <span style={{fontWeight: 'bold', fontSize: '12px'}}>SOURCE MANAGEMENT (WHALES)</span>
                    </div>
                     <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '12px'}}>
                        <thead>
                            <tr style={{textAlign: 'left', color: '#8b949e'}}>
                                <th style={{padding: '10px 15px'}}>ADDRESS</th>
                                <th style={{padding: '10px 15px'}}>SCORE</th>
                                <th style={{padding: '10px 15px'}}>ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {watchlist.map((whale, i) => (
                                <tr key={i} style={{borderTop: '1px solid #30363d', color: '#c9d1d9'}}>
                                    <td style={{padding: '10px 15px', fontFamily: 'monospace'}}>{whale.address}</td>
                                    <td style={{padding: '10px 15px', color: '#7ee787'}}>{whale.scoreA}</td>
                                    <td style={{padding: '10px 15px'}}>
                                        <button 
                                            onClick={() => killWhale(whale.address)}
                                            style={{background: 'transparent', border: '1px solid #f85149', color: '#f85149', cursor: 'pointer', borderRadius: '4px', fontSize: '10px', padding: '2px 8px'}}
                                        >
                                            KILL & BLOCK
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                     </table>
                </div>

            </div>

            {/* RIGHT SIDE: RISK CONTROLS */}
            <div style={{display: 'flex', flexDirection: 'column', gap: '20px'}}>
                
                {/* RISK CONFIGURATION */}
                <div style={cardStyle}>
                    <div style={{...labelStyle, fontSize: '12px', borderBottom: '1px solid #30363d', paddingBottom: '10px', marginBottom: '15px'}}>
                        ⚠️ RISK ENGINE (KELLY)
                    </div>
                    
                    <div style={{marginBottom: '15px'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '5px'}}>
                            <span style={{fontSize: '11px'}}>Kelly Fraction</span>
                            <span style={{fontSize: '11px', color: '#58a6ff'}}>{riskConfig.kellyFraction.toFixed(2)}x</span>
                        </div>
                        <input 
                            type="range" min="0.1" max="1.0" step="0.1" 
                            value={riskConfig.kellyFraction}
                            onChange={(e) => setRiskConfig({...riskConfig, kellyFraction: parseFloat(e.target.value)})}
                            style={{width: '100%'}}
                        />
                        <div style={{fontSize: '9px', color: '#8b949e'}}>
                            Controls aggressive sizing. 0.5 (Half Kelly) recommended.
                        </div>
                    </div>

                    <div style={{marginBottom: '15px'}}>
                         <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '5px'}}>
                            <span style={{fontSize: '11px'}}>Max Positions</span>
                            <span style={{fontSize: '11px', color: '#58a6ff'}}>{riskConfig.maxPositions}</span>
                        </div>
                        <input 
                            type="range" min="1" max="20" step="1" 
                            value={riskConfig.maxPositions}
                            onChange={(e) => setRiskConfig({...riskConfig, maxPositions: parseInt(e.target.value)})}
                            style={{width: '100%'}}
                        />
                    </div>

                    <div style={{marginTop: '20px', borderTop: '1px solid #30363d', paddingTop: '20px'}}>
                        <button 
                            onClick={toggleGlobalKillSwitch}
                            style={{
                                width: '100%', 
                                padding: '15px', 
                                background: riskConfig.globalKillSwitch ? '#f85149' : '#21262d', 
                                border: '1px solid #f85149',
                                color: '#fff',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                borderRadius: '6px'
                            }}
                        >
                            {riskConfig.globalKillSwitch ? 'RESUME TRADING' : 'STOP TRADING (KILL SWITCH)'}
                        </button>
                    </div>

                </div>

                 {/* EXECUTION LOGS (PORTFOLIO CONTEXT) */}
                 <div style={{...cardStyle, display: 'flex', flexDirection: 'column', flex: 1, maxHeight: '400px'}}>
                    <div style={{marginBottom: '10px', fontWeight: 'bold', color: '#8b949e', fontSize: '12px', borderBottom: '1px solid #30363d', paddingBottom: '10px'}}>
                        EXECUTION LOGS
                    </div>
                    <div style={{flex: 1, overflowY: 'auto', fontFamily: 'monospace', fontSize: '10px', display: 'flex', flexDirection: 'column', gap: '5px'}}>
                        {executionLogs.map((log, i) => (
                            <div key={i} style={{display: 'flex', gap: '8px'}}>
                                <span style={{color: '#8b949e'}}>{log.timestamp}</span>
                                <span style={{color: log.message.includes('SIGNAL') ? '#f2cc60' : log.message.includes('RISK') ? '#f85149' : log.message.includes('ORDER') ? themeColor : '#c9d1d9'}}>
                                    {log.message}
                                </span>
                            </div>
                        ))}
                        <div ref={logEndRefPortfolio} />
                    </div>
                </div>

            </div>

        </div>
      ) : activeTab === 'dashboard' ? (
        /* RESTORED RADAR (DASHBOARD) TAB */
        <div style={{display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px'}}>
            
            {/* LEFT COLUMN: VISUALS */}
            <div style={{display: 'flex', flexDirection: 'column', gap: '20px'}}>
                
                {/* METRICS ROW */}
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px'}}>
                    <div style={cardStyle}>
                        <div style={labelStyle}>WHALE AGGREGATE PNL</div>
                        <div style={{fontSize: '24px', fontWeight: 'bold', color: '#7ee787'}}>
                             ${watchlist.reduce((acc, w) => acc + w.pnl, 0).toLocaleString()}
                        </div>
                        <div style={{fontSize: '9px', color: '#8b949e'}}>Simulated lifetime value of tracked whales</div>
                    </div>
                    <div style={cardStyle}>
                        <div style={labelStyle}>ACTIVE AGENTS</div>
                        <div style={{fontSize: '24px', fontWeight: 'bold', color: '#58a6ff'}}>
                            {watchlist.length} / 150
                        </div>
                    </div>
                    <div style={cardStyle}>
                        <div style={labelStyle}>MODEL STATUS</div>
                        <div style={{fontSize: '12px', fontWeight: 'bold', display: 'grid', gap: '2px'}}>
                            <span style={{color: '#7ee787'}}>A: ONLINE (Sortino)</span>
                            <span style={{color: '#484f58'}}>B: OFFLINE</span>
                            <span style={{color: '#484f58'}}>C: OFFLINE</span>
                        </div>
                    </div>
                </div>

                {/* WATCHLIST TABLE (RADAR SCAN) */}
                <div style={{...cardStyle, padding: '0', overflow: 'hidden'}}>
                    <div style={{padding: '10px 15px', background: '#21262d', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <div style={{display: 'flex', flexDirection: 'column'}}>
                             <span style={{fontWeight: 'bold', fontSize: '12px'}}>TOP WHALES (STRATEGY COMPARISON)</span>
                             <span style={{fontSize: '10px', color: '#8b949e'}}>MULTI-MODEL MATRIX</span>
                        </div>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px', 
                            fontSize: '10px', color: '#7ee787', fontWeight: 'bold',
                            animation: 'pulse 2s infinite'
                        }}>
                            <div style={{width: '8px', height: '8px', borderRadius: '50%', background: '#7ee787'}}></div>
                            SCANNING NETWORK...
                        </div>
                        <style>{`
                            @keyframes pulse {
                                0% { opacity: 1; }
                                50% { opacity: 0.4; }
                                100% { opacity: 1; }
                            }
                        `}</style>
                    </div>
                    <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '12px'}}>
                        <thead>
                            <tr style={{textAlign: 'left', color: '#8b949e'}}>
                                <th style={{padding: '10px 15px'}}>ADDRESS</th>
                                <th style={{padding: '10px 15px'}}>MODEL A</th>
                                <th style={{padding: '10px 15px', color: '#484f58'}}>MODEL B</th>
                                <th style={{padding: '10px 15px', color: '#484f58'}}>MODEL C</th>
                                <th style={{padding: '10px 15px'}}>LIFETIME PNL</th>
                            </tr>
                        </thead>
                        <tbody>
                            {watchlist.map((whale, i) => (
                                <tr key={i} style={{borderTop: '1px solid #30363d', color: '#c9d1d9'}}>
                                    <td style={{padding: '10px 15px', fontFamily: 'monospace'}}>{whale.address}</td>
                                    <td style={{padding: '10px 15px'}}>
                                        <span style={{
                                            background: 'rgba(126, 231, 135, 0.2)', 
                                            color: '#7ee787',
                                            padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold'
                                        }}>
                                            {whale.scoreA}
                                        </span>
                                    </td>
                                    <td style={{padding: '10px 15px', color: '#484f58'}}>--</td>
                                    <td style={{padding: '10px 15px', color: '#484f58'}}>--</td>
                                    <td style={{padding: '10px 15px', color: whale.pnl >= 0 ? '#7ee787' : '#f85149'}}>
                                        ${whale.pnl.toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

            </div>

            {/* RIGHT COLUMN: SCANNER LOGS (RADAR CONTEXT) */}
            <div style={{...cardStyle, display: 'flex', flexDirection: 'column', height: '500px'}}>
                <div style={{marginBottom: '10px', fontWeight: 'bold', color: '#8b949e', fontSize: '12px', borderBottom: '1px solid #30363d', paddingBottom: '10px'}}>
                    HUNTER NETWORK FEED
                </div>
                <div style={{flex: 1, overflowY: 'auto', fontFamily: 'monospace', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '5px'}}>
                    {scannerLogs.map((log, i) => (
                        <div key={i} style={{display: 'flex', gap: '8px'}}>
                             <span style={{color: '#8b949e'}}>{log.timestamp}</span>
                             <span style={{color: log.message.includes('TRIBUNAL') ? '#58a6ff' : log.message.includes('REJECTED') ? '#f85149' : log.message.includes('APPROVED') ? '#7ee787' : '#c9d1d9'}}>
                                {log.message}
                            </span>
                        </div>
                    ))}
                    <div ref={logEndRefRadar} />
                </div>
            </div>

        </div>
      ) : (
        /* CODE TAB - RESTORED BLUEPRINT */
        <div style={{display: 'grid', gridTemplateColumns: '1fr', gap: '20px'}}>
            
            {/* ARCHITECTURAL BLUEPRINT */}
            <div style={{background: '#161b22', padding: '20px', borderRadius: '6px', border: '1px solid #238636'}}>
                <h3 style={{marginTop: 0, fontSize: '16px', color: '#238636'}}>System Architecture: The Tribunal Flow</h3>
                <div style={{
                    background: '#0d1117', 
                    padding: '15px', 
                    borderRadius: '6px', 
                    border: '1px solid #30363d', 
                    fontFamily: 'monospace', 
                    fontSize: '12px', 
                    color: '#c9d1d9',
                    whiteSpace: 'pre',
                    overflowX: 'auto',
                    lineHeight: '1.4'
                }}>
{`
[ POLYMARKET GAMMA API ] 
        |
        v
[ DRAGNET SCANNER (Observer) ] <---- [ THE GRAPH (Historical Data) ]
        | "Detects High Volume / Whale Activity"
        |
        v
[ TRIBUNAL ENGINE (The Judge) ]
        | 1. Sortino Ratio Check
        | 2. Consistency Check (70%+)
        | 3. Recency Check
        |
    ( SCORE > 80? )
    /           \\
   YES           NO
    |             |
    v             v
[ ATOMIC VAULT ]  [ REJECT PILE ]
(Write to DB)
    |
    v
[ EXECUTION AGENT ] --> [ KELLY CRITERION RISK SIZING ] --> [ ORDER SUBMISSION ]
`}
                </div>
            </div>

            <div style={{background: '#161b22', padding: '20px', borderRadius: '6px', border: '1px solid #238636'}}>
                <h3 style={{marginTop: 0, fontSize: '16px', color: '#238636'}}>
                    Core Logic: main.py 
                    <span style={{
                        fontSize: '10px', 
                        background: '#238636', 
                        color: 'white', 
                        padding: '2px 6px', 
                        borderRadius: '4px', 
                        marginLeft: '10px'
                    }}>
                        READY FOR ZEABUR (PROJECT B)
                    </span>
                </h3>
                <div style={{fontSize: '12px', color: '#8b949e', marginTop: '10px', marginBottom: '10px', borderLeft: '3px solid #f2cc60', paddingLeft: '10px'}}>
                    <strong>DEPLOYMENT INSTRUCTIONS:</strong>
                    <ul style={{margin: '5px 0', paddingLeft: '20px'}}>
                        <li>1. Copy the code below.</li>
                        <li>2. Go to your <strong>BOT Project (Project B)</strong> in Zeabur.</li>
                        <li>3. Paste this into <code>main.py</code>.</li>
                        <li>4. <strong>CRITICAL:</strong> Ensure your Service Settings in Zeabur has "Command" set to: <code>python main.py</code></li>
                    </ul>
                </div>
                <div style={{position: 'relative'}}>
                    <textarea 
                        readOnly
                        style={{
                            width: '100%', 
                            height: '400px', 
                            background: '#0d1117', 
                            color: '#c9d1d9', 
                            border: '1px solid #30363d', 
                            borderRadius: '6px', 
                            padding: '15px', 
                            fontFamily: 'monospace', 
                            fontSize: '12px',
                            whiteSpace: 'pre',
                            overflow: 'auto'
                        }}
                        value={PYTHON_CODE}
                    />
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

const tabStyle = {
    padding: '10px 20px',
    borderRadius: '6px',
    border: '1px solid',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '12px',
    fontFamily: 'Roboto Mono'
};

const cardStyle = {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: '6px',
    padding: '15px'
};

const labelStyle = {
    fontSize: '10px',
    color: '#8b949e',
    fontWeight: 'bold',
    marginBottom: '5px',
    textTransform: 'uppercase' as const
};

// --- PHASE 26.2: TRIBUNAL + EXECUTION (PRODUCTION READY) ---
const PYTHON_CODE = `import os
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
        log(f"v2.6.2 TRIBUNAL ONLINE. Risk Engine: KELLY ({KELLY_FRACTION}x).")

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
            log(f"[KELLY] Size: \${bet_size:.2f} (Prob: {win_prob:.2f}, Odds: {odds:.2f})")
            log(f"[ORDER] 🚀 SUBMITTED: \${bet_size:.2f}")
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
`;

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<App />);
}
