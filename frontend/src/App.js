import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import api from './api';

// Import components
import Navbar from './components/ui/Navbar';
import Explore from './components/layout/Explore';
import AllIndicesPage from './components/layout/AllIndicesPage';
import Holdings from './components/layout/Holdings';
import Positions from './components/layout/Positions';
import Orders from './components/layout/Orders';
import WatchlistPage from './components/layout/WatchlistPage';
import Recharge from './components/layout/Recharge';
import StockSearch from './components/trading/StockSearch';
import StockDetails from './components/trading/StockDetails';
import TradePanel from './components/trading/TradePanel';
import HoldingsTable from './components/portfolio/HoldingsTable';
import AuthScreen from './components/ui/AuthScreen';
import ProfileModal from './components/ui/ProfileModal';
import OptionChainModal from './components/trading/OptionChainModal';

function App() {
  // Auth & Security state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLocked, setIsLocked] = useState(() => {
    // Only lock on initial load if saved_trader exists in localStorage
    return !!localStorage.getItem('saved_trader');
  });
  const [username, setUsername] = useState('DemoTrader');
  const [toastMsg, setToastMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [userInfo, setUserInfo] = useState(null);

  // Option Chain Modal State
  const [isOptionChainOpen, setIsOptionChainOpen] = useState(false);
  const [optionChainSymbol, setOptionChainSymbol] = useState('NIFTY 50');

  // Trading state
  const [symbol, setSymbol] = useState('RELIANCE');
  const [price, setPrice] = useState(null);
  const [balance, setBalance] = useState(100000);
  const [portfolio, setPortfolio] = useState([]);
  const [activeTab, setActiveTab] = useState('explore');

  const handleOpenOptionChain = (sym) => {
    setOptionChainSymbol(sym || symbol || 'NIFTY 50');
    setIsOptionChainOpen(true);
  };

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4000);
  };

  const handleAuthSuccess = (userData) => {
    setIsLoggedIn(true);
    setIsLocked(false);
    if (userData.username) setUsername(userData.username);
    if (userData.balance !== undefined) setBalance(userData.balance);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (e) {}
    try {
      localStorage.removeItem('saved_trader');
    } catch (e) {}
    setIsLoggedIn(false);
    setIsLocked(false);
    setIsProfileOpen(false);
    showToast('Logged out');
  };

  const checkSession = useCallback(async () => {
    try {
      const data = await api.getMe();
      if (data.logged_in) {
        setIsLoggedIn(true);
        setUsername(data.username);
        setBalance(data.balance || 100000);
        setUserInfo(data);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const fetchPrice = useCallback(async () => {
    if (!symbol) return;
    try {
      const data = await api.getPrice(symbol);
      if (data.price) {
        setPrice(data.price);
      }
    } catch (error) {
      console.error('Error fetching price:', error);
    }
  }, [symbol]);

  const fetchPortfolio = useCallback(async () => {
    try {
      const data = await api.getPortfolio();
      if (data.portfolio !== undefined) {
        setPortfolio(data.portfolio || []);
        setBalance(data.balance || 0);
      }
    } catch (error) {
      console.error('Error fetching portfolio:', error);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      fetchPortfolio();
      fetchPrice();
      const interval = setInterval(() => {
        fetchPortfolio();
        if (activeTab === 'trading') {
          fetchPrice();
        }
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [isLoggedIn, activeTab, symbol, fetchPortfolio, fetchPrice]);



  const handleBuy = async (quantity) => {
    setLoading(true);
    try {
      const data = await api.buyStock(symbol, quantity);
      showToast(data.message || 'Order executed!');
      if (data.balance !== undefined) {
        setBalance(data.balance);
        fetchPortfolio();
      }
    } catch (error) {
      showToast(error.message || 'Error buying stock');
    }
    setLoading(false);
  };

  const handleSell = async (quantity) => {
    setLoading(true);
    try {
      const data = await api.sellStock(symbol, quantity);
      showToast(data.message || 'Order executed!');
      if (data.balance !== undefined) {
        setBalance(data.balance);
        fetchPortfolio();
      }
    } catch (error) {
      showToast(error.message || 'Error selling stock');
    }
    setLoading(false);
  };

  const handleSelectStock = (selectedSymbol) => {
    setSymbol(selectedSymbol);
    setActiveTab('trading');
    setTimeout(() => fetchPrice(), 100);
  };

  // Render Auth & PIN Lock Screen if not logged in or locked
  if (!isLoggedIn || isLocked) {
    return (
      <AuthScreen 
        onLoginSuccess={handleAuthSuccess}
        showToast={showToast}
      />
    );
  }

  // Render main app tabs
  const renderContent = () => {
    switch(activeTab) {
      case 'explore':
        return (
          <Explore 
            onSelectStock={handleSelectStock} 
            onOpenAllIndices={() => setActiveTab('all-indices')}
            portfolio={portfolio}
            showToast={showToast}
          />
        );

      case 'all-indices':
        return (
          <AllIndicesPage 
            onBack={() => setActiveTab('explore')} 
            onSelectStock={handleSelectStock}
          />
        );

      case 'holdings':
        return <Holdings portfolio={portfolio} balance={balance} />;

      case 'positions':
        return <Positions />;

      case 'orders':
        return <Orders />;

      case 'watchlist':
        return <WatchlistPage onSelectStock={handleSelectStock} />;

      case 'option-chain':
        return (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <StockSearch onSelectStock={handleSelectStock} showToast={showToast} />
            <div className="soft-card" style={{ padding: '24px', textAlign: 'center' }}>
              <h2 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)' }}>
                ⚡ Option Chain Matrix for {symbol}
              </h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
                View real-time Call (CE) & Put (PE) strike prices, Open Interest (OI), Implied Volatility (IV), and Greeks.
              </p>
              <button 
                onClick={() => handleOpenOptionChain(symbol)}
                style={{
                  padding: '12px 28px',
                  background: 'linear-gradient(135deg, #6C5CE7 0%, #a855f7 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  fontSize: '15px',
                  boxShadow: '0 4px 16px rgba(108, 92, 231, 0.4)'
                }}
              >
                ⚡ Open Live {symbol} Option Chain Matrix
              </button>
            </div>
          </div>
        );

      case 'recharge':
        return (
          <Recharge 
            balance={balance}
            onRecharge={(newBalance) => {
              setBalance(newBalance);
              fetchPortfolio();
            }}
          />
        );

      case 'trading': {
        const isIndexSymbol = symbol.startsWith('^') || symbol.includes('NIFTY') || symbol.includes('SENSEX') || symbol.includes('VIX');
        return (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <StockSearch onSelectStock={handleSelectStock} showToast={showToast} />
            <StockDetails 
              symbol={symbol} 
              portfolio={portfolio}
              onSell={handleSell}
              onBuy={handleBuy}
              onSelectStock={handleSelectStock}
              showToast={showToast} 
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
              {!isIndexSymbol && (
                <div style={{ flex: 1 }}>
                  <TradePanel
                    symbol={symbol}
                    price={price}
                    balance={balance}
                    onBuy={handleBuy}
                    onSell={handleSell}
                    loading={loading}
                  />
                </div>
              )}
              <div style={{ flex: 1 }}>
                <HoldingsTable holdings={portfolio} />
              </div>
            </div>
          </div>
        );
      }

      default:
        return (
          <Explore 
            onSelectStock={handleSelectStock} 
            onOpenAllIndices={() => setActiveTab('all-indices')}
            portfolio={portfolio}
          />
        );
    }
  };

  return (
    <div className="app-container">
      <Navbar
        username={username}
        balance={balance}
        onLogout={handleLogout}
        onLockApp={() => setIsLocked(true)}
        setActiveTab={setActiveTab}
        activeTab={activeTab}
        onOpenProfile={() => setIsProfileOpen(true)}
        profilePic={userInfo?.profile_pic}
      />

      <main className="main-content">
        {renderContent()}
      </main>

      {/* Mobile Bottom Navigation Bar (Phone view) */}
      <div className="mobile-bottom-nav">
        {[
          { id: 'explore', icon: '📈', label: 'Explore' },
          { id: 'holdings', icon: '💼', label: 'Holdings' },
          { id: 'positions', icon: '⚡', label: 'Positions' },
          { id: 'orders', icon: '📋', label: 'Orders' },
          { id: 'watchlist', icon: '⭐', label: 'Watchlist' },
        ].map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`mobile-nav-btn ${isActive ? 'active' : ''}`}
            >
              <span style={{ fontSize: '16px' }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* User Profile & KYC Modal */}
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        userInfo={userInfo}
        onLogout={handleLogout}
        onLockApp={() => setIsLocked(true)}
        onProfileUpdated={checkSession}
      />

      {/* Real-Time Option Chain Matrix Modal */}
      <OptionChainModal
        isOpen={isOptionChainOpen}
        onClose={() => setIsOptionChainOpen(false)}
        symbol={optionChainSymbol}
        onSelectContract={(contractSym, action, contractPrice) => {
          handleSelectStock(contractSym);
          showToast(`Selected Option ${contractSym} @ ₹${contractPrice}`);
        }}
      />

      {/* Floating Toast Notification */}
      {toastMsg && (
        <div className="toast-banner fade-in">
          <span>🔔</span>
          <span style={{ fontWeight: '600', fontSize: '13px' }}>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}

export default App;