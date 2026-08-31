import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const savedTheme = localStorage.getItem('bx_theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);