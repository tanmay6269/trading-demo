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
import NewsTerminal from './components/layout/NewsTerminal';
import StockSearch from './components/trading/StockSearch';
import StockDetails from './components/trading/StockDetails';
import TradePanel from './components/trading/TradePanel';
import HoldingsTable from './components/portfolio/HoldingsTable';
import AuthScreen from './components/ui/AuthScreen';
import ProfileModal from './components/ui/ProfileModal';
import OptionChainModal from './components/trading/OptionChainModal';

function App() {
  // Auth & Security state
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
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
  const [balance, setBalance] = useState(1000000);
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
    if (userData && userData.username) setUsername(userData.username);
    if (userData && userData.balance !== undefined) setBalance(userData.balance);
    checkSession();
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (e) {}
    try {
      localStorage.removeItem('saved_trader');
    } catch (e) {}
    setIsProfileOpen(false);
    setUsername('DemoTrader');
    setBalance(1000000);
    setUserInfo(null);
    setIsLocked(true);
    showToast('Logged out');
  };

  const checkSession = useCallback(async () => {
    try {
      const data = await api.getMe();
      if (data && data.logged_in) {
        setIsLoggedIn(true);
        setUsername(data.username || 'DemoTrader');
        setBalance(data.balance !== undefined ? data.balance : 1000000);
        setUserInfo(data);
      } else {
        const guest = await api.loginGuest();
        if (guest && guest.user) {
          setIsLoggedIn(true);
          setUsername(guest.user || 'DemoTrader');
          setBalance(guest.balance !== undefined ? guest.balance : 1000000);
          setUserInfo(guest);
        }
      }
    } catch (e) {
      setIsLoggedIn(true);
    }
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

  // Render Auth & PIN Lock Screen if locked
  if (isLocked) {
    return (
      <AuthScreen
        onLoginSuccess={handleAuthSuccess}
        onClose={() => { setIsLocked(false); checkSession(); }}
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
            onViewHoldings={() => setActiveTab('holdings')}
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

      case 'news':
        return <NewsTerminal onSelectStock={handleSelectStock} />;

      case 'option-chain':
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
            <StockSearch onSelectStock={handleSelectStock} onOpenOptionChain={handleOpenOptionChain} showToast={showToast} />
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
            onOpenOptionChain={handleOpenOptionChain}
            portfolio={portfolio}
            onViewHoldings={() => setActiveTab('holdings')}
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
        onOpenOptionChain={() => handleOpenOptionChain(symbol)}
      />

      <main className="main-content">
        {renderContent()}
      </main>

      {/* Mobile Bottom Navigation Bar (Phone view) */}
      <div className="mobile-bottom-nav">
        {[
          { id: 'explore', icon: 'M3 13l9-8 9 8M5 11v9h5v-5h4v5h5v-9', label: 'Home' },
          { id: 'news', icon: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z', label: 'News' },
          { id: 'holdings', icon: 'M4 4h16v16H4zM4 9h16M9 4v5', label: 'Holdings' },
          { id: 'positions', icon: 'M3 12h4l3-8 4 16 3-8h4', label: 'Positions' },
          { id: 'orders', icon: 'M8 6h11M8 12h11M8 18h11M4 6h.01M4 12h.01M4 18h.01', label: 'Orders' },
          { id: 'watchlist', icon: 'M12 3l2.9 5.9 6.1.9-4.5 4.3 1.1 6.1-5.6-3-5.6 3 1.1-6.1L3 9.8l6.1-.9z', label: 'Watchlist' },
        ].map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`mobile-nav-btn ${isActive ? 'active' : ''}`}
            >
              <span className="mnav-ico">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon} />
                </svg>
              </span>
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