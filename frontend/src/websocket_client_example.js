// websocket_client_example.js
// -----------------------------
// How your React frontend should connect to the FastAPI WebSocket
// instead of polling /api/stock/... or /api/option-chain/... every few seconds.

const WS_BASE_URL = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'ws://127.0.0.1:5000'
  : 'wss://trading-demo-backend.onrender.com';

/**
 * Connect to live price stream (broadcasts top stocks & indices)
 * @param {Function} onUpdate - callback receiving (stocks, indices)
 * @returns {WebSocket} active WebSocket instance
 */
export function connectLivePrices(onUpdate) {
  const ws = new WebSocket(`${WS_BASE_URL}/ws/prices`);

  ws.onopen = () => console.log("[ws:prices] Connected to live ticks");

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "price_update") {
        onUpdate(data.stocks, data.indices);
      }
    } catch (e) {
      console.error("[ws:prices] parse error", e);
    }
  };

  ws.onclose = () => {
    console.log("[ws:prices] Disconnected — auto-reconnecting in 2s...");
    setTimeout(() => connectLivePrices(onUpdate), 2000);
  };

  ws.onerror = (err) => console.error("[ws:prices] error", err);

  return ws;
}

/**
 * Connect to real-time Option Chain stream for a specific underlying symbol
 * @param {string} symbol - e.g. "NIFTY", "BANKNIFTY", "RELIANCE"
 * @param {Function} onUpdate - callback receiving (strikes, source)
 * @returns {WebSocket} active WebSocket instance
 */
export function connectOptionChain(symbol, onUpdate) {
  const ws = new WebSocket(`${WS_BASE_URL}/ws/option-chain/${symbol}`);

  ws.onopen = () => console.log(`[ws:option-chain] Connected for ${symbol}`);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "option_chain_update") {
        onUpdate(data.strikes, data.source);
      }
    } catch (e) {
      console.error("[ws:option-chain] parse error", e);
    }
  };

  ws.onclose = () => {
    console.log(`[ws:option-chain] Disconnected for ${symbol} — reconnecting in 2s`);
    setTimeout(() => connectOptionChain(symbol, onUpdate), 2000);
  };

  ws.onerror = (err) => console.error("[ws:option-chain] error", err);

  return ws;
}
