const API_BASE_URL = 'https://trading-demo-backend.onrender.com/api';

const defaultHeaders = {
    'Content-Type': 'application/json',
};

const handleResponse = async (response) => {
    let data;
    try {
        const text = await response.text();
        try {
            data = JSON.parse(text);
        } catch (e) {
            data = { error: text.includes('Proxy error') || text.includes('502') || text.includes('503') ? '⏳ Server is waking up... Please wait 5 seconds and try again.' : 'Server response error. Please try again.' };
        }
    } catch (e) {
        data = { error: 'Connection lost. Please check your internet connection.' };
    }

    if (!response.ok) {
        throw new Error(data.error || data.message || 'API request failed');
    }
    return data;
};

export const api = {
    // Auth & Session
    getMe: async () => {
        const res = await fetch(`${API_BASE_URL}/me`, { credentials: 'include' });
        return handleResponse(res);
    },

    updateProfile: async (profileData) => {
        const res = await fetch(`${API_BASE_URL}/user/profile/update`, {
            method: 'POST',
            headers: defaultHeaders,
            credentials: 'include',
            body: JSON.stringify(profileData)
        });
        return handleResponse(res);
    },

    updateProfilePhoto: async (profilePic) => {
        const res = await fetch(`${API_BASE_URL}/user/profile/photo`, {
            method: 'POST',
            headers: defaultHeaders,
            credentials: 'include',
            body: JSON.stringify({ profile_pic: profilePic })
        });
        return handleResponse(res);
    },

    loginGuest: async () => {
        const res = await fetch(`${API_BASE_URL}/guest-login`, {
            method: 'POST',
            headers: defaultHeaders,
            credentials: 'include'
        });
        return handleResponse(res);
    },

    registerStep1: async (username, email, phone, password) => {
        const res = await fetch(`${API_BASE_URL}/auth/register-step1`, {
            method: 'POST',
            headers: defaultHeaders,
            credentials: 'include',
            body: JSON.stringify({ username, email, phone, password })
        });
        return handleResponse(res);
    },

    verifyOTP: async (identifier, otp_code) => {
        const res = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
            method: 'POST',
            headers: defaultHeaders,
            credentials: 'include',
            body: JSON.stringify({ identifier, otp_code })
        });
        return handleResponse(res);
    },

    setMPIN: async (identifier, mpin) => {
        const res = await fetch(`${API_BASE_URL}/auth/set-mpin`, {
            method: 'POST',
            headers: defaultHeaders,
            credentials: 'include',
            body: JSON.stringify({ identifier, mpin })
        });
        return handleResponse(res);
    },

    loginPassword: async (identifier, password) => {
        const res = await fetch(`${API_BASE_URL}/auth/login-password`, {
            method: 'POST',
            headers: defaultHeaders,
            credentials: 'include',
            body: JSON.stringify({ identifier, password })
        });
        return handleResponse(res);
    },

    verifyMPIN: async (identifier, mpin) => {
        const res = await fetch(`${API_BASE_URL}/auth/verify-mpin`, {
            method: 'POST',
            headers: defaultHeaders,
            credentials: 'include',
            body: JSON.stringify({ identifier, mpin })
        });
        return handleResponse(res);
    },

    resetMPIN: async (email, password, new_mpin) => {
        const res = await fetch(`${API_BASE_URL}/auth/reset-mpin`, {
            method: 'POST',
            headers: defaultHeaders,
            credentials: 'include',
            body: JSON.stringify({ email, password, new_mpin })
        });
        return handleResponse(res);
    },

    login: async (username, password) => {
        const res = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: defaultHeaders,
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        return handleResponse(res);
    },

    register: async (username, email, password) => {
        const res = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: defaultHeaders,
            credentials: 'include',
            body: JSON.stringify({ username, email, password })
        });
        return handleResponse(res);
    },

    logout: async () => {
        const res = await fetch(`${API_BASE_URL}/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        return handleResponse(res);
    },

    // Stock Market Data
    getIndices: async () => {
        const res = await fetch(`${API_BASE_URL}/index-data`);
        return handleResponse(res);
    },

    getAllIndicesTable: async () => {
        const res = await fetch(`${API_BASE_URL}/all-indices-table`);
        return handleResponse(res);
    },

    getPrice: async (symbol) => {
        const res = await fetch(`${API_BASE_URL}/price/${symbol}`);
        return handleResponse(res);
    },

    getPrices: async (symbols) => {
        const res = await fetch(`${API_BASE_URL}/prices`, {
            method: 'POST',
            headers: defaultHeaders,
            body: JSON.stringify({ symbols })
        });
        return handleResponse(res);
    },

    getStockInfo: async (symbol) => {
        const res = await fetch(`${API_BASE_URL}/stock-info/${symbol}`);
        return handleResponse(res);
    },

    searchStocks: async (query) => {
        const res = await fetch(`${API_BASE_URL}/search/${encodeURIComponent(query)}`);
        return handleResponse(res);
    },

    getAllStocks: async () => {
        const res = await fetch(`${API_BASE_URL}/all-stocks`);
        return handleResponse(res);
    },

    getHistoricalData: async (symbol, period = '1d', interval = '1m') => {
        const res = await fetch(`${API_BASE_URL}/historical/${symbol}?period=${period}&interval=${interval}`);
        return handleResponse(res);
    },

    // Watchlist & Trading
    getWatchlist: async () => {
        const res = await fetch(`${API_BASE_URL}/watchlist`, { credentials: 'include' });
        return handleResponse(res);
    },

    addToWatchlist: async (symbol) => {
        const res = await fetch(`${API_BASE_URL}/watchlist/add`, {
            method: 'POST',
            headers: defaultHeaders,
            credentials: 'include',
            body: JSON.stringify({ symbol })
        });
        return handleResponse(res);
    },

    removeFromWatchlist: async (symbol) => {
        const res = await fetch(`${API_BASE_URL}/watchlist/remove`, {
            method: 'POST',
            headers: defaultHeaders,
            credentials: 'include',
            body: JSON.stringify({ symbol })
        });
        return handleResponse(res);
    },

    buyStock: async (symbol, quantity) => {
        const res = await fetch(`${API_BASE_URL}/buy`, {
            method: 'POST',
            headers: defaultHeaders,
            credentials: 'include',
            body: JSON.stringify({ symbol, quantity })
        });
        return handleResponse(res);
    },

    sellStock: async (symbol, quantity) => {
        const res = await fetch(`${API_BASE_URL}/sell`, {
            method: 'POST',
            headers: defaultHeaders,
            credentials: 'include',
            body: JSON.stringify({ symbol, quantity })
        });
        return handleResponse(res);
    },

    getPortfolio: async () => {
        const res = await fetch(`${API_BASE_URL}/portfolio`, { credentials: 'include' });
        return handleResponse(res);
    },

    rechargeBalance: async (amount) => {
        const res = await fetch(`${API_BASE_URL}/recharge`, {
            method: 'POST',
            headers: defaultHeaders,
            credentials: 'include',
            body: JSON.stringify({ amount })
        });
        return handleResponse(res);
    },

    submitPaymentUTR: async (utr_number, package_amount = 100000, real_price = 500) => {
        const res = await fetch(`${API_BASE_URL}/recharge/submit-payment`, {
            method: 'POST',
            headers: defaultHeaders,
            credentials: 'include',
            body: JSON.stringify({ utr_number, package_amount, real_price })
        });
        return handleResponse(res);
    }
};

export default api;
