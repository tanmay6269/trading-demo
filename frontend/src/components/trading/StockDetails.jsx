import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api';
import PriceChart from './PriceChart';
import StockLogo from '../ui/StockLogo';
import OptionChainModal from './OptionChainModal';

const INDEX_COMPANIES = {
    '^NSEI': [
        { name: 'Adani Enterprises Ltd.', symbol: 'ADANIENT', mcap: '₹3,65,000 Cr', price: '₹3,180.00', change: '+2.10%', sector: 'Metals & Mining' },
        { name: 'Adani Ports & SEZ Ltd.', symbol: 'ADANIPORTS', mcap: '₹3,20,000 Cr', price: '₹1,480.00', change: '+1.50%', sector: 'Infrastructure' },
        { name: 'Apollo Hospitals Enterprise Ltd.', symbol: 'APOLLOHOSP', mcap: '₹98,500 Cr', price: '₹6,850.00', change: '+0.75%', sector: 'Healthcare' },
        { name: 'Asian Paints Ltd.', symbol: 'ASIANPAINT', mcap: '₹2,64,412 Cr', price: '₹2,696.30', change: '-2.15%', sector: 'Paints & Durables' },
        { name: 'Axis Bank Ltd.', symbol: 'AXISBANK', mcap: '₹3,52,000 Cr', price: '₹1,145.00', change: '-0.45%', sector: 'Private Banking' },
        { name: 'Bajaj Auto Ltd.', symbol: 'BAJAJ-AUTO', mcap: '₹2,75,000 Cr', price: '₹9,820.00', change: '+1.40%', sector: 'Automobiles' },
        { name: 'Bajaj Finance Ltd.', symbol: 'BAJFINANCE', mcap: '₹4,12,000 Cr', price: '₹6,820.00', change: '+1.20%', sector: 'NBFC' },
        { name: 'Bajaj Finserv Ltd.', symbol: 'BAJFINSV', mcap: '₹2,55,000 Cr', price: '₹1,605.00', change: '+0.85%', sector: 'Financial Holding' },
        { name: 'Bharat Electronics Ltd. (BEL)', symbol: 'BEL', mcap: '₹2,20,000 Cr', price: '₹305.00', change: '+1.90%', sector: 'Capital Goods / Defense' },
        { name: 'Bharat Petroleum Corp. (BPCL)', symbol: 'BPCL', mcap: '₹1,42,000 Cr', price: '₹328.00', change: '-0.50%', sector: 'Oil & Gas' },
        { name: 'Bharti Airtel Ltd.', symbol: 'BHARTIARTL', mcap: '₹8,12,000 Cr', price: '₹1,420.10', change: '+0.65%', sector: 'Telecommunication' },
        { name: 'Britannia Industries Ltd.', symbol: 'BRITANNIA', mcap: '₹1,38,000 Cr', price: '₹5,750.00', change: '+0.40%', sector: 'FMCG (Food)' },
        { name: 'Cipla Ltd.', symbol: 'CIPLA', mcap: '₹1,24,000 Cr', price: '₹1,540.00', change: '+1.10%', sector: 'Pharmaceuticals' },
        { name: 'Coal India Ltd.', symbol: 'COALINDIA', mcap: '₹3,20,000 Cr', price: '₹515.00', change: '+1.70%', sector: 'Mining & Energy' },
        { name: "Dr. Reddy's Laboratories Ltd.", symbol: 'DRREDDY', mcap: '₹1,12,000 Cr', price: '₹6,720.00', change: '+0.30%', sector: 'Pharmaceuticals' },
        { name: 'Eicher Motors Ltd.', symbol: 'EICHERMOT', mcap: '₹1,32,000 Cr', price: '₹4,820.00', change: '+1.60%', sector: 'Automobiles' },
        { name: 'Grasim Industries Ltd.', symbol: 'GRASIM', mcap: '₹1,78,000 Cr', price: '₹2,680.00', change: '+0.90%', sector: 'Materials & Cement' },
        { name: 'HCL Technologies Ltd.', symbol: 'HCLTECH', mcap: '₹4,20,000 Cr', price: '₹1,560.00', change: '+0.25%', sector: 'IT Services' },
        { name: 'HDFC Bank Ltd.', symbol: 'HDFCBANK', mcap: '₹12,45,000 Cr', price: '₹727.00', change: '-0.27%', sector: 'Private Banking' },
        { name: 'HDFC Life Insurance Co. Ltd.', symbol: 'HDFCLIFE', mcap: '₹1,45,000 Cr', price: '₹675.00', change: '+0.50%', sector: 'Life Insurance' },
        { name: 'Hero MotoCorp Ltd.', symbol: 'HEROMOTOCO', mcap: '₹1,08,000 Cr', price: '₹5,410.00', change: '+1.25%', sector: 'Automobiles' },
        { name: 'Hindalco Industries Ltd.', symbol: 'HINDALCO', mcap: '₹1,48,000 Cr', price: '₹665.00', change: '+0.95%', sector: 'Metals & Mining' },
        { name: 'Hindustan Unilever Ltd. (HUL)', symbol: 'HINDUNILVR', mcap: '₹6,35,000 Cr', price: '₹2,710.00', change: '-0.15%', sector: 'FMCG' },
        { name: 'ICICI Bank Ltd.', symbol: 'ICICIBANK', mcap: '₹8,42,100 Cr', price: '₹1,204.50', change: '+0.82%', sector: 'Private Banking' },
        { name: 'IndusInd Bank Ltd.', symbol: 'INDUSINDBK', mcap: '₹1,08,000 Cr', price: '₹1,390.00', change: '-0.60%', sector: 'Private Banking' },
        { name: 'Infosys Ltd.', symbol: 'INFY', mcap: '₹6,85,200 Cr', price: '₹1,169.20', change: '-0.59%', sector: 'IT Services' },
        { name: 'ITC Ltd.', symbol: 'ITC', mcap: '₹6,15,000 Cr', price: '₹492.50', change: '+0.35%', sector: 'FMCG / Diversified' },
        { name: 'JSW Steel Ltd.', symbol: 'JSWSTEEL', mcap: '₹2,25,000 Cr', price: '₹930.00', change: '+0.50%', sector: 'Steel & Metals' },
        { name: 'Kotak Mahindra Bank Ltd.', symbol: 'KOTAKBANK', mcap: '₹3,40,100 Cr', price: '₹1,710.00', change: '+0.30%', sector: 'Private Banking' },
        { name: 'Larsen & Toubro Ltd. (L&T)', symbol: 'LT', mcap: '₹5,10,200 Cr', price: '₹3,560.00', change: '+0.95%', sector: 'Engineering & Construction' },
        { name: 'Mahindra & Mahindra Ltd. (M&M)', symbol: 'M&M', mcap: '₹3,45,000 Cr', price: '₹2,840.00', change: '+1.85%', sector: 'Automobiles' },
        { name: 'Maruti Suzuki India Ltd.', symbol: 'MARUTI', mcap: '₹3,90,000 Cr', price: '₹12,400.00', change: '-0.40%', sector: 'Automobiles' },
        { name: 'Nestlé India Ltd.', symbol: 'NESTLEIND', mcap: '₹2,42,000 Cr', price: '₹2,510.00', change: '+0.10%', sector: 'FMCG (Food)' },
        { name: 'NTPC Ltd.', symbol: 'NTPC', mcap: '₹3,80,000 Cr', price: '₹395.00', change: '+0.75%', sector: 'Power Utilities' },
        { name: 'Oil & Natural Gas Corp. (ONGC)', symbol: 'ONGC', mcap: '₹4,15,000 Cr', price: '₹325.00', change: '+1.45%', sector: 'Oil & Gas' },
        { name: 'Power Grid Corp. of India Ltd.', symbol: 'POWERGRID', mcap: '₹3,10,000 Cr', price: '₹335.00', change: '+0.40%', sector: 'Power Transmission' },
        { name: 'Reliance Industries Ltd. (RIL)', symbol: 'RELIANCE', mcap: '₹17,65,400 Cr', price: '₹1,310.00', change: '-1.43%', sector: 'Energy & Telecom' },
        { name: 'State Bank of India (SBI)', symbol: 'SBIN', mcap: '₹7,15,600 Cr', price: '₹812.30', change: '+1.14%', sector: 'Public Banking' },
        { name: 'SBI Life Insurance Co. Ltd.', symbol: 'SBILIFE', mcap: '₹1,75,000 Cr', price: '₹1,750.00', change: '+0.60%', sector: 'Life Insurance' },
        { name: 'Shriram Finance Ltd.', symbol: 'SHRIRAMFIN', mcap: '₹1,10,000 Cr', price: '₹2,950.00', change: '+0.80%', sector: 'NBFC' },
        { name: 'Sun Pharma Ltd.', symbol: 'SUNPHARMA', mcap: '₹4,10,000 Cr', price: '₹1,710.00', change: '+1.10%', sector: 'Pharmaceuticals' },
        { name: 'Tata Consultancy Services (TCS)', symbol: 'TCS', mcap: '₹13,24,100 Cr', price: '₹2,361.00', change: '+0.48%', sector: 'IT Services' },
        { name: 'Tata Consumer Products Ltd.', symbol: 'TATACONSUM', mcap: '₹1,18,000 Cr', price: '₹1,190.00', change: '+0.45%', sector: 'FMCG' },
        { name: 'Tata Motors Ltd.', symbol: 'TATAMOTORS', mcap: '₹3,60,000 Cr', price: '₹1,020.00', change: '+0.90%', sector: 'Automobiles' },
        { name: 'Tata Steel Ltd.', symbol: 'TATASTEEL', mcap: '₹2,10,000 Cr', price: '₹165.00', change: '-0.90%', sector: 'Steel & Metals' },
        { name: 'Tech Mahindra Ltd.', symbol: 'TECHM', mcap: '₹1,45,000 Cr', price: '₹1,510.00', change: '+0.70%', sector: 'IT Services' },
        { name: 'Titan Company Ltd.', symbol: 'TITAN', mcap: '₹3,10,000 Cr', price: '₹3,490.00', change: '-0.80%', sector: 'Retail & Durables' },
        { name: 'Trent Ltd.', symbol: 'TRENT', mcap: '₹2,40,000 Cr', price: '₹6,800.00', change: '+2.40%', sector: 'Retail Services' },
        { name: 'UltraTech Cement Ltd.', symbol: 'ULTRACEMCO', mcap: '₹3,15,000 Cr', price: '₹10,850.00', change: '+0.60%', sector: 'Cement' },
        { name: 'Wipro Ltd.', symbol: 'WIPRO', mcap: '₹2,60,000 Cr', price: '₹495.00', change: '-0.15%', sector: 'IT Services' }
    ],
    '^BSESN': [
        { name: 'Adani Ports & SEZ Ltd.', symbol: 'ADANIPORTS', bseCode: '532921', mcap: '₹3,20,000 Cr', price: '₹1,480.00', change: '+1.50%', sector: 'Infrastructure & Logistics' },
        { name: 'Asian Paints Ltd.', symbol: 'ASIANPAINT', bseCode: '500820', mcap: '₹2,64,412 Cr', price: '₹2,696.30', change: '-2.15%', sector: 'Consumer Durables (Paints)' },
        { name: 'Axis Bank Ltd.', symbol: 'AXISBANK', bseCode: '532215', mcap: '₹3,52,000 Cr', price: '₹1,145.00', change: '-0.45%', sector: 'Private Banking' },
        { name: 'Bajaj Finance Ltd.', symbol: 'BAJFINANCE', bseCode: '500034', mcap: '₹4,12,000 Cr', price: '₹6,820.00', change: '+1.20%', sector: 'NBFC' },
        { name: 'Bajaj Finserv Ltd.', symbol: 'BAJAJFINSV', bseCode: '532978', mcap: '₹2,55,000 Cr', price: '₹1,605.00', change: '+0.85%', sector: 'Financial Holding' },
        { name: 'Bharat Electronics Ltd. (BEL)', symbol: 'BEL', bseCode: '500049', mcap: '₹2,20,000 Cr', price: '₹305.00', change: '+1.90%', sector: 'Capital Goods / Defense' },
        { name: 'Bharti Airtel Ltd.', symbol: 'BHARTIARTL', bseCode: '532454', mcap: '₹8,12,000 Cr', price: '₹1,420.10', change: '+0.65%', sector: 'Telecommunications' },
        { name: 'Eternal Ltd. (Zomato)', symbol: 'ZOMATO', bseCode: '543426', mcap: '₹2,45,000 Cr', price: '₹262.50', change: '+2.80%', sector: 'E-Commerce / Consumer' },
        { name: 'HCL Technologies Ltd.', symbol: 'HCLTECH', bseCode: '532281', mcap: '₹4,20,000 Cr', price: '₹1,560.00', change: '+0.25%', sector: 'Information Technology' },
        { name: 'HDFC Bank Ltd.', symbol: 'HDFCBANK', bseCode: '500180', mcap: '₹12,45,000 Cr', price: '₹727.00', change: '-0.27%', sector: 'Private Banking' },
        { name: 'Hindustan Unilever Ltd. (HUL)', symbol: 'HINDUNILVR', bseCode: '500696', mcap: '₹6,35,000 Cr', price: '₹2,710.00', change: '-0.15%', sector: 'FMCG' },
        { name: 'ICICI Bank Ltd.', symbol: 'ICICIBANK', bseCode: '532174', mcap: '₹8,42,100 Cr', price: '₹1,204.50', change: '+0.82%', sector: 'Private Banking' },
        { name: 'Infosys Ltd.', symbol: 'INFY', bseCode: '500209', mcap: '₹6,85,200 Cr', price: '₹1,169.20', change: '-0.59%', sector: 'Information Technology' },
        { name: 'ITC Ltd.', symbol: 'ITC', bseCode: '500875', mcap: '₹6,15,000 Cr', price: '₹492.50', change: '+0.35%', sector: 'FMCG / Diversified' },
        { name: 'Kotak Mahindra Bank Ltd.', symbol: 'KOTAKBANK', bseCode: '500247', mcap: '₹3,40,100 Cr', price: '₹1,710.00', change: '+0.30%', sector: 'Private Banking' },
        { name: 'Larsen & Toubro Ltd. (L&T)', symbol: 'LT', bseCode: '500510', mcap: '₹5,10,200 Cr', price: '₹3,560.00', change: '+0.95%', sector: 'Engineering & Construction' },
        { name: 'Mahindra & Mahindra Ltd. (M&M)', symbol: 'M&M', bseCode: '500520', mcap: '₹3,45,000 Cr', price: '₹2,840.00', change: '+1.85%', sector: 'Automobiles' },
        { name: 'Maruti Suzuki India Ltd.', symbol: 'MARUTI', bseCode: '532500', mcap: '₹3,90,000 Cr', price: '₹12,400.00', change: '-0.40%', sector: 'Automobiles' },
        { name: 'NTPC Ltd.', symbol: 'NTPC', bseCode: '532555', mcap: '₹3,80,000 Cr', price: '₹395.00', change: '+0.75%', sector: 'Power Utilities' },
        { name: 'Oil & Natural Gas Corp. (ONGC)', symbol: 'ONGC', bseCode: '500312', mcap: '₹4,15,000 Cr', price: '₹325.00', change: '+1.45%', sector: 'Oil & Gas Exploration' },
        { name: 'Power Grid Corp. of India Ltd.', symbol: 'POWERGRID', bseCode: '535789', mcap: '₹3,10,000 Cr', price: '₹335.00', change: '+0.40%', sector: 'Power Transmission' },
        { name: 'Reliance Industries Ltd. (RIL)', symbol: 'RELIANCE', bseCode: '500325', mcap: '₹17,65,400 Cr', price: '₹1,310.00', change: '-1.43%', sector: 'Diversified Energy/Telecom' },
        { name: 'State Bank of India (SBI)', symbol: 'SBIN', bseCode: '500112', mcap: '₹7,15,600 Cr', price: '₹812.30', change: '+1.14%', sector: 'Public Banking' },
        { name: 'Sun Pharma Ltd.', symbol: 'SUNPHARMA', bseCode: '524715', mcap: '₹4,10,000 Cr', price: '₹1,710.00', change: '+1.10%', sector: 'Pharmaceuticals' },
        { name: 'Tata Consultancy Services (TCS)', symbol: 'TCS', bseCode: '532540', mcap: '₹13,24,100 Cr', price: '₹2,361.00', change: '+0.48%', sector: 'Information Technology' },
        { name: 'Tata Steel Ltd.', symbol: 'TATASTEEL', bseCode: '500470', mcap: '₹2,10,000 Cr', price: '₹165.00', change: '-0.90%', sector: 'Metals & Mining (Steel)' },
        { name: 'Tech Mahindra Ltd.', symbol: 'TECHM', bseCode: '532755', mcap: '₹1,45,000 Cr', price: '₹1,510.00', change: '+0.70%', sector: 'Information Technology' },
        { name: 'Titan Company Ltd.', symbol: 'TITAN', bseCode: '500114', mcap: '₹3,10,000 Cr', price: '₹3,490.00', change: '-0.80%', sector: 'Consumer Durables / Retail' },
        { name: 'Trent Ltd.', symbol: 'TRENT', bseCode: '500251', mcap: '₹2,40,000 Cr', price: '₹6,800.00', change: '+2.40%', sector: 'Consumer Services / Retail' },
        { name: 'UltraTech Cement Ltd.', symbol: 'ULTRACEMCO', bseCode: '532538', mcap: '₹3,15,000 Cr', price: '₹10,850.00', change: '+0.60%', sector: 'Construction Materials' }
    ],
    '^NSEBANK': [
        { name: 'AU Small Finance Bank Ltd.', symbol: 'AUBANK', mcap: '₹46,000 Cr', price: '₹625.00', change: '+0.70%', sector: 'Private (Small Finance Bank)' },
        { name: 'Axis Bank Ltd.', symbol: 'AXISBANK', mcap: '₹3,52,000 Cr', price: '₹1,145.00', change: '-0.45%', sector: 'Private Sector Bank' },
        { name: 'Bandhan Bank Ltd.', symbol: 'BANDHANBNK', mcap: '₹32,000 Cr', price: '₹202.10', change: '-0.50%', sector: 'Private Sector Bank' },
        { name: 'Bank of Baroda', symbol: 'BANKBARODA', mcap: '₹1,32,000 Cr', price: '₹255.40', change: '+0.90%', sector: 'Public Sector Bank (PSU)' },
        { name: 'Federal Bank Ltd.', symbol: 'FEDERALBNK', mcap: '₹48,000 Cr', price: '₹198.50', change: '+0.40%', sector: 'Private Sector Bank' },
        { name: 'HDFC Bank Ltd.', symbol: 'HDFCBANK', mcap: '₹12,45,000 Cr', price: '₹727.00', change: '-0.27%', sector: 'Private Sector Bank' },
        { name: 'ICICI Bank Ltd.', symbol: 'ICICIBANK', mcap: '₹8,42,100 Cr', price: '₹1,204.50', change: '+0.82%', sector: 'Private Sector Bank' },
        { name: 'IDFC FIRST Bank Ltd.', symbol: 'IDFCFIRSTB', mcap: '₹52,000 Cr', price: '₹74.80', change: '-0.20%', sector: 'Private Sector Bank' },
        { name: 'IndusInd Bank Ltd.', symbol: 'INDUSINDBK', mcap: '₹1,08,000 Cr', price: '₹1,390.00', change: '-0.60%', sector: 'Private Sector Bank' },
        { name: 'Kotak Mahindra Bank Ltd.', symbol: 'KOTAKBANK', mcap: '₹3,40,100 Cr', price: '₹1,710.00', change: '+0.30%', sector: 'Private Sector Bank' },
        { name: 'Punjab National Bank (PNB)', symbol: 'PNB', mcap: '₹1,28,000 Cr', price: '₹118.20', change: '+1.30%', sector: 'Public Sector Bank (PSU)' },
        { name: 'State Bank of India (SBI)', symbol: 'SBIN', mcap: '₹7,15,600 Cr', price: '₹812.30', change: '+1.14%', sector: 'Public Sector Bank (PSU)' }
    ],
    'NIFTYNEXT50.NS': [
        { name: 'Bharat Electronics Ltd. (BEL)', symbol: 'BEL', mcap: '₹2,20,000 Cr', price: '₹305.00', change: '+1.90%', sector: 'Defense' },
        { name: 'Eternal Ltd. (Zomato)', symbol: 'ZOMATO', mcap: '₹2,45,000 Cr', price: '₹262.50', change: '+2.80%', sector: 'Consumer Tech' },
        { name: 'Trent Ltd.', symbol: 'TRENT', mcap: '₹2,40,000 Cr', price: '₹6,800.00', change: '+2.40%', sector: 'Retail' },
        { name: 'Hindustan Aeronautics Ltd.', symbol: 'HAL', mcap: '₹3,12,000 Cr', price: '₹4,680.00', change: '+1.85%', sector: 'Defense / Aerospace' },
        { name: 'Adani Power Ltd.', symbol: 'ADANIPOWER', mcap: '₹2,50,000 Cr', price: '₹650.00', change: '+1.20%', sector: 'Utilities' },
        { name: 'Jindal Steel & Power Ltd.', symbol: 'JINDALSTEL', mcap: '₹98,000 Cr', price: '₹960.00', change: '+0.70%', sector: 'Metals' },
        { name: 'Varun Beverages Ltd.', symbol: 'VBL', mcap: '₹2,10,000 Cr', price: '₹1,580.00', change: '+1.40%', sector: 'Consumer Goods' },
        { name: 'DLF Limited', symbol: 'DLF', mcap: '₹2,15,000 Cr', price: '₹870.00', change: '+0.95%', sector: 'Realty' },
        { name: 'Siemens Ltd.', symbol: 'SIEMENS', mcap: '₹2,40,000 Cr', price: '₹6,750.00', change: '+0.50%', sector: 'Capital Goods' },
        { name: 'ABB India Ltd.', symbol: 'ABB', mcap: '₹1,65,000 Cr', price: '₹7,800.00', change: '+0.80%', sector: 'Industrial Tech' }
    ],
    'NIFTY_FIN_SERVICE.NS': [
        { name: 'HDFC Bank Ltd.', symbol: 'HDFCBANK', mcap: '₹12,45,000 Cr', price: '₹727.00', change: '-0.27%', sector: 'Private Bank' },
        { name: 'ICICI Bank Ltd.', symbol: 'ICICIBANK', mcap: '₹8,42,100 Cr', price: '₹1,204.50', change: '+0.82%', sector: 'Private Bank' },
        { name: 'State Bank of India (SBI)', symbol: 'SBIN', mcap: '₹7,15,600 Cr', price: '₹812.30', change: '+1.14%', sector: 'Public Bank' },
        { name: 'Kotak Mahindra Bank Ltd.', symbol: 'KOTAKBANK', mcap: '₹3,40,100 Cr', price: '₹1,710.00', change: '+0.30%', sector: 'Private Bank' },
        { name: 'Axis Bank Ltd.', symbol: 'AXISBANK', mcap: '₹3,52,000 Cr', price: '₹1,145.00', change: '-0.45%', sector: 'Private Bank' },
        { name: 'Bajaj Finance Ltd.', symbol: 'BAJFINANCE', mcap: '₹4,12,000 Cr', price: '₹6,820.00', change: '+1.20%', sector: 'NBFC' },
        { name: 'Bajaj Finserv Ltd.', symbol: 'BAJFINSV', mcap: '₹2,55,000 Cr', price: '₹1,605.00', change: '+0.85%', sector: 'Financial Holding' },
        { name: 'HDFC Life Insurance Co. Ltd.', symbol: 'HDFCLIFE', mcap: '₹1,45,000 Cr', price: '₹675.00', change: '+0.50%', sector: 'Insurance' },
        { name: 'SBI Life Insurance Co. Ltd.', symbol: 'SBILIFE', mcap: '₹1,75,000 Cr', price: '₹1,750.00', change: '+0.60%', sector: 'Insurance' },
        { name: 'Shriram Finance Ltd.', symbol: 'SHRIRAMFIN', mcap: '₹1,10,000 Cr', price: '₹2,950.00', change: '+0.80%', sector: 'NBFC' }
    ],
    'NIFTY_PVT_BANK.NS': [
        { name: 'HDFC Bank Ltd.', symbol: 'HDFCBANK', mcap: '₹12,45,000 Cr', price: '₹727.00', change: '-0.27%', sector: 'Private Sector Bank' },
        { name: 'ICICI Bank Ltd.', symbol: 'ICICIBANK', mcap: '₹8,42,100 Cr', price: '₹1,204.50', change: '+0.82%', sector: 'Private Sector Bank' },
        { name: 'Axis Bank Ltd.', symbol: 'AXISBANK', mcap: '₹3,52,000 Cr', price: '₹1,145.00', change: '-0.45%', sector: 'Private Sector Bank' },
        { name: 'Kotak Mahindra Bank Ltd.', symbol: 'KOTAKBANK', mcap: '₹3,40,100 Cr', price: '₹1,710.00', change: '+0.30%', sector: 'Private Sector Bank' },
        { name: 'IndusInd Bank Ltd.', symbol: 'INDUSINDBK', mcap: '₹1,08,000 Cr', price: '₹1,390.00', change: '-0.60%', sector: 'Private Sector Bank' },
        { name: 'Federal Bank Ltd.', symbol: 'FEDERALBNK', mcap: '₹48,000 Cr', price: '₹198.50', change: '+0.40%', sector: 'Private Sector Bank' },
        { name: 'IDFC FIRST Bank Ltd.', symbol: 'IDFCFIRSTB', mcap: '₹52,000 Cr', price: '₹74.80', change: '-0.20%', sector: 'Private Sector Bank' },
        { name: 'AU Small Finance Bank', symbol: 'AUBANK', mcap: '₹46,000 Cr', price: '₹625.00', change: '+0.70%', sector: 'Small Finance Bank' },
        { name: 'Bandhan Bank Ltd.', symbol: 'BANDHANBNK', mcap: '₹32,000 Cr', price: '₹202.10', change: '-0.50%', sector: 'Private Sector Bank' }
    ],
    '^CNXPSU': [
        { name: 'State Bank of India (SBI)', symbol: 'SBIN', mcap: '₹7,15,600 Cr', price: '₹812.30', change: '+1.14%', sector: 'Public Sector Bank (PSU)' },
        { name: 'Bank of Baroda', symbol: 'BANKBARODA', mcap: '₹1,32,000 Cr', price: '₹255.40', change: '+0.90%', sector: 'Public Sector Bank (PSU)' },
        { name: 'Punjab National Bank (PNB)', symbol: 'PNB', mcap: '₹1,28,000 Cr', price: '₹118.20', change: '+1.30%', sector: 'Public Sector Bank (PSU)' },
        { name: 'Canara Bank', symbol: 'CANBK', mcap: '₹1,05,000 Cr', price: '₹115.40', change: '+1.10%', sector: 'Public Sector Bank (PSU)' },
        { name: 'Union Bank of India', symbol: 'UNIONBANK', mcap: '₹95,000 Cr', price: '₹132.00', change: '+0.80%', sector: 'Public Sector Bank (PSU)' },
        { name: 'Indian Bank', symbol: 'INDIANB', mcap: '₹72,000 Cr', price: '₹540.00', change: '+0.60%', sector: 'Public Sector Bank (PSU)' },
        { name: 'Bank of India', symbol: 'BANKINDIA', mcap: '₹58,000 Cr', price: '₹128.50', change: '+0.45%', sector: 'Public Sector Bank (PSU)' }
    ],
    'BSE-BANK.BO': [
        { name: 'HDFC Bank Ltd.', symbol: 'HDFCBANK', bseCode: '500180', mcap: '₹12,45,000 Cr', price: '₹727.00', change: '-0.27%', sector: 'Private Sector Bank' },
        { name: 'ICICI Bank Ltd.', symbol: 'ICICIBANK', bseCode: '532174', mcap: '₹8,42,100 Cr', price: '₹1,204.50', change: '+0.82%', sector: 'Private Sector Bank' },
        { name: 'State Bank of India (SBI)', symbol: 'SBIN', bseCode: '500112', mcap: '₹7,15,600 Cr', price: '₹812.30', change: '+1.14%', sector: 'Public Sector Bank' },
        { name: 'Axis Bank Ltd.', symbol: 'AXISBANK', bseCode: '532215', mcap: '₹3,52,000 Cr', price: '₹1,145.00', change: '-0.45%', sector: 'Private Sector Bank' },
        { name: 'Kotak Mahindra Bank Ltd.', symbol: 'KOTAKBANK', bseCode: '500247', mcap: '₹3,40,100 Cr', price: '₹1,710.00', change: '+0.30%', sector: 'Private Sector Bank' },
        { name: 'IndusInd Bank Ltd.', symbol: 'INDUSINDBK', bseCode: '532218', mcap: '₹1,08,000 Cr', price: '₹1,390.00', change: '-0.60%', sector: 'Private Sector Bank' }
    ],
    '^CNXIT': [
        { name: 'Tata Consultancy Services (TCS)', symbol: 'TCS', mcap: '₹13,24,100 Cr', price: '₹2,361.00', change: '+0.48%', sector: 'Information Technology' },
        { name: 'Infosys Ltd.', symbol: 'INFY', mcap: '₹6,85,200 Cr', price: '₹1,169.20', change: '-0.59%', sector: 'Information Technology' },
        { name: 'HCL Technologies Ltd.', symbol: 'HCLTECH', mcap: '₹4,20,000 Cr', price: '₹1,560.00', change: '+0.25%', sector: 'Information Technology' },
        { name: 'Wipro Ltd.', symbol: 'WIPRO', mcap: '₹2,60,000 Cr', price: '₹495.00', change: '-0.15%', sector: 'Information Technology' },
        { name: 'Tech Mahindra Ltd.', symbol: 'TECHM', mcap: '₹1,45,000 Cr', price: '₹1,510.00', change: '+0.70%', sector: 'Information Technology' },
        { name: 'LTIMindtree Ltd.', symbol: 'LTIM', mcap: '₹1,68,000 Cr', price: '₹5,680.00', change: '+0.85%', sector: 'Information Technology' },
        { name: 'Persistent Systems Ltd.', symbol: 'PERSISTENT', mcap: '₹1,12,000 Cr', price: '₹5,200.00', change: '+1.40%', sector: 'IT Products & Engineering' },
        { name: 'Coforge Ltd.', symbol: 'COFORGE', mcap: '₹42,000 Cr', price: '₹6,450.00', change: '+1.10%', sector: 'IT Services' },
        { name: 'Mphasis Ltd.', symbol: 'MPHASIS', mcap: '₹52,000 Cr', price: '₹2,780.00', change: '+0.30%', sector: 'IT Services' }
    ],
    'BSE-IT.BO': [
        { name: 'Tata Consultancy Services (TCS)', symbol: 'TCS', bseCode: '532540', mcap: '₹13,24,100 Cr', price: '₹2,361.00', change: '+0.48%', sector: 'IT Services' },
        { name: 'Infosys Ltd.', symbol: 'INFY', bseCode: '500209', mcap: '₹6,85,200 Cr', price: '₹1,169.20', change: '-0.59%', sector: 'IT Services' },
        { name: 'HCL Technologies Ltd.', symbol: 'HCLTECH', bseCode: '532281', mcap: '₹4,20,000 Cr', price: '₹1,560.00', change: '+0.25%', sector: 'IT Services' },
        { name: 'Wipro Ltd.', symbol: 'WIPRO', bseCode: '500790', mcap: '₹2,60,000 Cr', price: '₹495.00', change: '-0.15%', sector: 'IT Services' }
    ],
    '^CNXPHARMA': [
        { name: 'Sun Pharma Ltd.', symbol: 'SUNPHARMA', mcap: '₹4,10,000 Cr', price: '₹1,710.00', change: '+1.10%', sector: 'Pharmaceuticals' },
        { name: 'Cipla Ltd.', symbol: 'CIPLA', mcap: '₹1,24,000 Cr', price: '₹1,540.00', change: '+1.10%', sector: 'Pharmaceuticals' },
        { name: "Dr. Reddy's Laboratories", symbol: 'DRREDDY', mcap: '₹1,12,000 Cr', price: '₹6,720.00', change: '+0.30%', sector: 'Pharmaceuticals' },
        { name: "Divi's Laboratories Ltd.", symbol: 'DIVISLAB', mcap: '₹1,30,000 Cr', price: '₹4,850.00', change: '+0.90%', sector: 'Pharma / API' },
        { name: 'Lupin Ltd.', symbol: 'LUPIN', mcap: '₹95,000 Cr', price: '₹2,080.00', change: '+1.45%', sector: 'Pharmaceuticals' },
        { name: 'Aurobindo Pharma Ltd.', symbol: 'AUROPHARMA', mcap: '₹82,000 Cr', price: '₹1,410.00', change: '+0.75%', sector: 'Pharmaceuticals' },
        { name: 'Zydus Lifesciences Ltd.', symbol: 'ZYDUSLIFE', mcap: '₹1,15,000 Cr', price: '₹1,140.00', change: '+1.20%', sector: 'Healthcare' },
        { name: 'Torrent Pharmaceuticals', symbol: 'TORNTPHARM', mcap: '₹1,02,000 Cr', price: '₹3,020.00', change: '+0.60%', sector: 'Pharmaceuticals' }
    ],
    '^CNXAUTO': [
        { name: 'Tata Motors Ltd.', symbol: 'TATAMOTORS', mcap: '₹3,60,000 Cr', price: '₹1,020.00', change: '+0.90%', sector: 'Automobiles' },
        { name: 'Maruti Suzuki India Ltd.', symbol: 'MARUTI', mcap: '₹3,90,000 Cr', price: '₹12,400.00', change: '-0.40%', sector: 'Automobiles' },
        { name: 'Mahindra & Mahindra Ltd. (M&M)', symbol: 'M&M', mcap: '₹3,45,000 Cr', price: '₹2,840.00', change: '+1.85%', sector: 'Automobiles' },
        { name: 'Bajaj Auto Ltd.', symbol: 'BAJAJ-AUTO', mcap: '₹2,75,000 Cr', price: '₹9,820.00', change: '+1.40%', sector: 'Automobiles (2W/3W)' },
        { name: 'Eicher Motors Ltd.', symbol: 'EICHERMOT', mcap: '₹1,32,000 Cr', price: '₹4,820.00', change: '+1.60%', sector: 'Automobiles' },
        { name: 'Hero MotoCorp Ltd.', symbol: 'HEROMOTOCO', mcap: '₹1,08,000 Cr', price: '₹5,410.00', change: '+1.25%', sector: 'Automobiles (2W)' },
        { name: 'TVS Motor Company Ltd.', symbol: 'TVSMOTOR', mcap: '₹1,18,000 Cr', price: '₹2,480.00', change: '+1.50%', sector: 'Automobiles (2W)' },
        { name: 'Bosch Ltd.', symbol: 'BOSCHLTD', mcap: '₹98,000 Cr', price: '₹33,200.00', change: '+0.70%', sector: 'Auto Ancillaries' }
    ],
    '^CNXFMCG': [
        { name: 'Hindustan Unilever Ltd. (HUL)', symbol: 'HINDUNILVR', mcap: '₹6,35,000 Cr', price: '₹2,710.00', change: '-0.15%', sector: 'FMCG' },
        { name: 'ITC Ltd.', symbol: 'ITC', mcap: '₹6,15,000 Cr', price: '₹492.50', change: '+0.35%', sector: 'FMCG / Diversified' },
        { name: 'Britannia Industries Ltd.', symbol: 'BRITANNIA', mcap: '₹1,38,000 Cr', price: '₹5,750.00', change: '+0.40%', sector: 'FMCG (Food)' },
        { name: 'Nestlé India Ltd.', symbol: 'NESTLEIND', mcap: '₹2,42,000 Cr', price: '₹2,510.00', change: '+0.10%', sector: 'FMCG (Food)' },
        { name: 'Tata Consumer Products Ltd.', symbol: 'TATACONSUM', mcap: '₹1,18,000 Cr', price: '₹1,190.00', change: '+0.45%', sector: 'FMCG' },
        { name: 'Godrej Consumer Products', symbol: 'GODREJCP', mcap: '₹1,42,000 Cr', price: '₹1,380.00', change: '+0.90%', sector: 'Personal Care' },
        { name: 'Dabur India Ltd.', symbol: 'DABUR', mcap: '₹1,10,000 Cr', price: '₹620.00', change: '+0.25%', sector: 'FMCG / Ayurvedic' },
        { name: 'Varun Beverages Ltd.', symbol: 'VBL', mcap: '₹2,10,000 Cr', price: '₹1,580.00', change: '+1.40%', sector: 'Beverages' }
    ],
    '^CNXMETAL': [
        { name: 'Tata Steel Ltd.', symbol: 'TATASTEEL', mcap: '₹2,10,000 Cr', price: '₹165.00', change: '-0.90%', sector: 'Steel & Metals' },
        { name: 'JSW Steel Ltd.', symbol: 'JSWSTEEL', mcap: '₹2,25,000 Cr', price: '₹930.00', change: '+0.50%', sector: 'Steel & Metals' },
        { name: 'Hindalco Industries Ltd.', symbol: 'HINDALCO', mcap: '₹1,48,000 Cr', price: '₹665.00', change: '+0.95%', sector: 'Aluminium & Metals' },
        { name: 'Coal India Ltd.', symbol: 'COALINDIA', mcap: '₹3,20,000 Cr', price: '₹515.00', change: '+1.70%', sector: 'Mining' },
        { name: 'Vedanta Ltd.', symbol: 'VEDL', mcap: '₹1,65,000 Cr', price: '₹445.00', change: '+2.10%', sector: 'Diversified Metals' },
        { name: 'Jindal Steel & Power', symbol: 'JINDALSTEL', mcap: '₹98,000 Cr', price: '₹960.00', change: '+0.70%', sector: 'Steel' },
        { name: 'NMDC Ltd.', symbol: 'NMDC', mcap: '₹75,000 Cr', price: '₹255.00', change: '+1.30%', sector: 'Iron Ore Mining' }
    ],
    '^CNXREALTY': [
        { name: 'DLF Limited', symbol: 'DLF', mcap: '₹2,15,000 Cr', price: '₹870.00', change: '+0.95%', sector: 'Real Estate' },
        { name: 'Godrej Properties Ltd.', symbol: 'GODREJPROP', mcap: '₹85,000 Cr', price: '₹3,050.00', change: '+1.80%', sector: 'Real Estate' },
        { name: 'Oberoi Realty Ltd.', symbol: 'OBEROIRLTY', mcap: '₹65,000 Cr', price: '₹1,780.00', change: '+0.60%', sector: 'Real Estate' },
        { name: 'The Phoenix Mills Ltd.', symbol: 'PHOENIXLTD', mcap: '₹62,000 Cr', price: '₹3,480.00', change: '+1.20%', sector: 'Retail Real Estate' },
        { name: 'Prestige Estates Projects', symbol: 'PRESTIGE', mcap: '₹70,000 Cr', price: '₹1,750.00', change: '+2.10%', sector: 'Real Estate' }
    ],
    '^CNXMEDIA': [
        { name: 'Zee Entertainment Enterprises', symbol: 'ZEEL', mcap: '₹14,500 Cr', price: '₹152.00', change: '-1.20%', sector: 'Broadcasting & Media' },
        { name: 'Sun TV Network Ltd.', symbol: 'SUNTV', mcap: '₹31,000 Cr', price: '₹785.00', change: '+0.80%', sector: 'Broadcasting' },
        { name: 'PVR INOX Ltd.', symbol: 'PVRINOX', mcap: '₹14,000 Cr', price: '₹1,420.00', change: '+0.45%', sector: 'Entertainment / Cinema' },
        { name: 'Nazara Technologies', symbol: 'NAZARA', mcap: '₹7,200 Cr', price: '₹940.00', change: '+1.60%', sector: 'Gaming & Media' }
    ],
    '^CNXCOMMODITIES': [
        { name: 'Reliance Industries Ltd.', symbol: 'RELIANCE', mcap: '₹17,65,400 Cr', price: '₹1,310.00', change: '-1.43%', sector: 'Refining & Energy' },
        { name: 'Oil & Natural Gas Corp. (ONGC)', symbol: 'ONGC', mcap: '₹4,15,000 Cr', price: '₹325.00', change: '+1.45%', sector: 'Oil & Gas' },
        { name: 'NTPC Ltd.', symbol: 'NTPC', mcap: '₹3,80,000 Cr', price: '₹395.00', change: '+0.75%', sector: 'Power Utilities' },
        { name: 'Coal India Ltd.', symbol: 'COALINDIA', mcap: '₹3,20,000 Cr', price: '₹515.00', change: '+1.70%', sector: 'Energy & Coal' },
        { name: 'Tata Steel Ltd.', symbol: 'TATASTEEL', mcap: '₹2,10,000 Cr', price: '₹165.00', change: '-0.90%', sector: 'Metals' },
        { name: 'Hindalco Industries', symbol: 'HINDALCO', mcap: '₹1,48,000 Cr', price: '₹665.00', change: '+0.95%', sector: 'Metals' }
    ],
    'BSE-IPO.BO': [
        { name: 'Eternal Ltd. (Zomato)', symbol: 'ZOMATO', bseCode: '543426', mcap: '₹2,45,000 Cr', price: '₹262.50', change: '+2.80%', sector: 'E-Commerce / Consumer' },
        { name: 'Jio Financial Services', symbol: 'JIOFIN', bseCode: '543940', mcap: '₹2,15,000 Cr', price: '₹345.00', change: '+1.10%', sector: 'Financial Tech' },
        { name: 'Mankind Pharma Ltd.', symbol: 'MANKIND', bseCode: '543904', mcap: '₹95,000 Cr', price: '₹2,380.00', change: '+0.85%', sector: 'Healthcare' },
        { name: 'Tata Technologies Ltd.', symbol: 'TATATECH', bseCode: '544028', mcap: '₹41,000 Cr', price: '₹1,010.00', change: '+0.40%', sector: 'Engineering ER&D' }
    ],
    '^INDIAVIX': [
        { name: 'NIFTY 50 Option Volatility Benchmark', symbol: '^NSEI', mcap: 'Benchmark', price: '₹24,350.00', change: '+0.35%', sector: 'Volatility Index' }
    ],
    'NIFTY_MID_SELECT.NS': [
        { name: 'Polycab India Ltd.', symbol: 'POLYCAB', mcap: '₹98,000 Cr', price: '₹6,520.00', change: '+1.80%', sector: 'Electrical Wires' },
        { name: 'Persistent Systems Ltd.', symbol: 'PERSISTENT', mcap: '₹1,12,000 Cr', price: '₹5,200.00', change: '+1.40%', sector: 'IT Services' },
        { name: 'Coforge Ltd.', symbol: 'COFORGE', mcap: '₹42,000 Cr', price: '₹6,450.00', change: '+1.10%', sector: 'IT Services' },
        { name: 'HDFC Asset Management', symbol: 'HDFCAMC', mcap: '₹92,000 Cr', price: '₹4,320.00', change: '+0.95%', sector: 'Asset Management' }
    ],
    '^NSEMDCP50': [
        { name: 'Polycab India Ltd.', symbol: 'POLYCAB', mcap: '₹98,000 Cr', price: '₹6,520.00', change: '+1.80%', sector: 'Electrical Wires' },
        { name: 'Supreme Industries Ltd.', symbol: 'SUPREMEIND', mcap: '₹68,000 Cr', price: '₹5,350.00', change: '+0.75%', sector: 'Plastics & Piping' },
        { name: 'Cummins India Ltd.', symbol: 'CUMMINSIND', mcap: '₹1,05,000 Cr', price: '₹3,780.00', change: '+1.30%', sector: 'Capital Goods' }
    ],
    'NIFTY_MIDCAP_100.NS': [
        { name: 'Polycab India Ltd.', symbol: 'POLYCAB', mcap: '₹98,000 Cr', price: '₹6,520.00', change: '+1.80%', sector: 'Electrical Wires' },
        { name: 'Persistent Systems Ltd.', symbol: 'PERSISTENT', mcap: '₹1,12,000 Cr', price: '₹5,200.00', change: '+1.40%', sector: 'IT Services' },
        { name: 'Ashok Leyland Ltd.', symbol: 'ASHOKLEY', mcap: '₹68,000 Cr', price: '₹232.00', change: '+1.15%', sector: 'Automobiles (CV)' },
        { name: 'Bharat Forge Ltd.', symbol: 'BHARATFORG', mcap: '₹75,000 Cr', price: '₹1,610.00', change: '+0.80%', sector: 'Auto Ancillaries' }
    ],
    'NIFTYMIDCAP150.NS': [
        { name: 'Polycab India Ltd.', symbol: 'POLYCAB', mcap: '₹98,000 Cr', price: '₹6,520.00', change: '+1.80%', sector: 'Electrical Wires' },
        { name: 'Supreme Industries Ltd.', symbol: 'SUPREMEIND', mcap: '₹68,000 Cr', price: '₹5,350.00', change: '+0.75%', sector: 'Plastics & Piping' },
        { name: 'Astral Ltd.', symbol: 'ASTRAL', mcap: '₹58,000 Cr', price: '₹2,150.00', change: '+0.60%', sector: 'Piping & Building' }
    ],
    'BSE-MIDCAP.BO': [
        { name: 'Polycab India Ltd.', symbol: 'POLYCAB', bseCode: '542652', mcap: '₹98,000 Cr', price: '₹6,520.00', change: '+1.80%', sector: 'Electrical Wires' },
        { name: 'Cummins India Ltd.', symbol: 'CUMMINSIND', bseCode: '500480', mcap: '₹1,05,000 Cr', price: '₹3,780.00', change: '+1.30%', sector: 'Capital Goods' }
    ],
    'NIFTYSMLCAP100.NS': [
        { name: 'Angel One Ltd.', symbol: 'ANGELONE', mcap: '₹24,000 Cr', price: '₹2,680.00', change: '+2.10%', sector: 'Financial Tech / Broking' },
        { name: 'Central Depository Services (CDSL)', symbol: 'CDSL', mcap: '₹32,000 Cr', price: '₹1,540.00', change: '+1.90%', sector: 'Capital Market Infra' },
        { name: 'Suzlon Energy Ltd.', symbol: 'SUZLON', mcap: '₹92,000 Cr', price: '₹68.50', change: '+4.80%', sector: 'Renewable Energy' }
    ],
    'NIFTYSMLCAP250.NS': [
        { name: 'Angel One Ltd.', symbol: 'ANGELONE', mcap: '₹24,000 Cr', price: '₹2,680.00', change: '+2.10%', sector: 'Broking' },
        { name: 'Birlasoft Ltd.', symbol: 'BSOFT', mcap: '₹18,000 Cr', price: '₹650.00', change: '+0.90%', sector: 'IT Services' },
        { name: 'Karur Vysya Bank', symbol: 'KARURVYSYA', mcap: '₹17,500 Cr', price: '₹218.00', change: '+1.40%', sector: 'Banking' }
    ],
    'BSE-SMLCAP.BO': [
        { name: 'Central Depository Services (CDSL)', symbol: 'CDSL', bseCode: '540615', mcap: '₹32,000 Cr', price: '₹1,540.00', change: '+1.90%', sector: 'Capital Market Infra' },
        { name: 'Suzlon Energy Ltd.', symbol: 'SUZLON', bseCode: '532667', mcap: '₹92,000 Cr', price: '₹68.50', change: '+4.80%', sector: 'Renewable Energy' }
    ],
    '^CNX100': [
        { name: 'Reliance Industries Ltd.', symbol: 'RELIANCE', mcap: '₹17,65,400 Cr', price: '₹1,310.00', change: '-1.43%', sector: 'Energy & Telecom' },
        { name: 'Tata Consultancy Services', symbol: 'TCS', mcap: '₹13,24,100 Cr', price: '₹2,361.00', change: '+0.48%', sector: 'IT Services' },
        { name: 'HDFC Bank Ltd.', symbol: 'HDFCBANK', mcap: '₹12,45,000 Cr', price: '₹727.00', change: '-0.27%', sector: 'Banking' },
        { name: 'Infosys Ltd.', symbol: 'INFY', mcap: '₹6,85,200 Cr', price: '₹1,169.20', change: '-0.59%', sector: 'IT Services' },
        { name: 'ICICI Bank Ltd.', symbol: 'ICICIBANK', mcap: '₹8,42,100 Cr', price: '₹1,204.50', change: '+0.82%', sector: 'Banking' }
    ],
    '^CRSLDX': [
        { name: 'Reliance Industries Ltd.', symbol: 'RELIANCE', mcap: '₹17,65,400 Cr', price: '₹1,310.00', change: '-1.43%', sector: 'Energy & Telecom' },
        { name: 'Tata Consultancy Services', symbol: 'TCS', mcap: '₹13,24,100 Cr', price: '₹2,361.00', change: '+0.48%', sector: 'IT Services' },
        { name: 'HDFC Bank Ltd.', symbol: 'HDFCBANK', mcap: '₹12,45,000 Cr', price: '₹727.00', change: '-0.27%', sector: 'Banking' }
    ],
    'NIFTYTOTALMKT.NS': [
        { name: 'Reliance Industries Ltd.', symbol: 'RELIANCE', mcap: '₹17,65,400 Cr', price: '₹1,310.00', change: '-1.43%', sector: 'Energy & Telecom' },
        { name: 'Tata Consultancy Services', symbol: 'TCS', mcap: '₹13,24,100 Cr', price: '₹2,361.00', change: '+0.48%', sector: 'IT Services' },
        { name: 'HDFC Bank Ltd.', symbol: 'HDFCBANK', mcap: '₹12,45,000 Cr', price: '₹727.00', change: '-0.27%', sector: 'Banking' }
    ],
    'BSE-100.BO': [
        { name: 'Reliance Industries Ltd.', symbol: 'RELIANCE', bseCode: '500325', mcap: '₹17,65,400 Cr', price: '₹1,310.00', change: '-1.43%', sector: 'Energy & Telecom' },
        { name: 'Tata Consultancy Services', symbol: 'TCS', bseCode: '532540', mcap: '₹13,24,100 Cr', price: '₹2,361.00', change: '+0.48%', sector: 'IT Services' },
        { name: 'HDFC Bank Ltd.', symbol: 'HDFCBANK', bseCode: '500180', mcap: '₹12,45,000 Cr', price: '₹727.00', change: '-0.27%', sector: 'Banking' }
    ]
};




const StockDetails = ({ 
    symbol = 'RELIANCE', 
    portfolio = [], 
    onSell = () => {}, 
    onBuy = () => {}, 
    onSelectStock = () => {},
    showToast = () => {} 
}) => {
    const [stockInfo, setStockInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'fno' | 'etfs'
    const [watchlist, setWatchlist] = useState([]);
    const [alertSet, setAlertSet] = useState(false);
    const [showOptionChainModal, setShowOptionChainModal] = useState(false);
    const [optionFilter, setOptionFilter] = useState('All'); // 'All' | 'Put' | 'Call'
    const [fnoChainData, setFnoChainData] = useState(null);

    const fetchStockDetails = useCallback(async () => {
        if (!symbol) return;
        try {
            const data = await api.getStockInfo(symbol);
            setStockInfo(data);
        } catch (error) {
            console.error('Error fetching stock info:', error);
        }
        setLoading(false);
    }, [symbol]);

    const fetchFnoChain = useCallback(async () => {
        if (!symbol) return;
        try {
            const data = await api.getOptionChain(symbol, '', 'NSE');
            if (data && data.chain) {
                setFnoChainData(data);
            }
        } catch (e) {}
    }, [symbol]);

    const fetchWatchlist = useCallback(async () => {
        try {
            const wlData = await api.getWatchlist();
            if (wlData && Array.isArray(wlData.watchlist)) {
                setWatchlist(wlData.watchlist);
            }
        } catch (e) {}
    }, []);

    useEffect(() => {
        if (symbol) {
            setLoading(true);
            fetchStockDetails();
            fetchFnoChain();
            fetchWatchlist();
            const interval = setInterval(() => {
                fetchStockDetails();
                fetchFnoChain();
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [symbol, fetchStockDetails, fetchFnoChain, fetchWatchlist]);

    const toggleWatchlist = async () => {
        const isStarred = watchlist.includes(symbol);
        try {
            if (isStarred) {
                await api.removeFromWatchlist(symbol);
                setWatchlist(watchlist.filter(s => s !== symbol));
                showToast(`❌ Removed ${symbol} from Watchlist`);
            } else {
                await api.addToWatchlist(symbol);
                setWatchlist([...watchlist, symbol]);
                showToast(`⭐ Added ${symbol} to Watchlist`);
            }
        } catch (e) {
            showToast('Error updating watchlist');
        }
    };

    const handleCreateAlert = () => {
        setAlertSet(true);
        showToast(`⏰ Price alert created for ${symbol} at ₹${stockInfo?.price?.toFixed(2) || 'current price'}`);
    };

    if (loading && !stockInfo) {
        return (
            <div className="soft-card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Loading live market data for {symbol}...
            </div>
        );
    }

    if (!stockInfo) return null;

    const price = stockInfo.price || 0;
    const prevClose = stockInfo.prev_close || (price > 0 ? price : 1);
    const change = stockInfo.change !== undefined && stockInfo.change !== null ? stockInfo.change : (price - prevClose);
    const changePercent = stockInfo.change_percent !== undefined && stockInfo.change_percent !== null ? stockInfo.change_percent : (prevClose ? (change / prevClose) * 100 : 0);
    const isPositive = change >= 0;

    const dayLow = stockInfo.day_low || (price ? roundNum(price * 0.995) : 24296.80);
    const dayHigh = stockInfo.day_high || (price ? roundNum(price * 1.005) : 24405.20);
    const fiftyTwoLow = stockInfo['52w_low'] || (price ? roundNum(price * 0.85) : 22182.55);
    const fiftyTwoHigh = stockInfo['52w_high'] || (price ? roundNum(price * 1.15) : 26373.20);
    const openPrice = stockInfo.open || (price ? roundNum(price * 0.998) : 24361.90);

    const isStarred = watchlist.includes(symbol);

    // Support and Resistance Pivot Calculations
    const pivot = roundNum((dayHigh + dayLow + price) / 3);
    const r1 = roundNum((2 * pivot) - dayLow);
    const r2 = roundNum(pivot + (dayHigh - dayLow));
    const r3 = roundNum(dayHigh + 2 * (pivot - dayLow));
    const s1 = roundNum((2 * pivot) - dayHigh);
    const s2 = roundNum(pivot - (dayHigh - dayLow));
    const s3 = roundNum(dayLow - 2 * (dayHigh - pivot));

    const rangePercent = (val, low, high) => {
        if (high <= low) return 50;
        const pct = ((val - low) / (high - low)) * 100;
        return Math.min(Math.max(pct, 2), 98);
    };

    const normalizeIndexSymbol = (sym) => {
        if (!sym) return '^NSEI';
        const clean = sym.trim();
        const map = {
            'NIFTY 50': '^NSEI',
            'BSE SENSEX': '^BSESN',
            'SENSEX': '^BSESN',
            'Nifty Next 50': 'NIFTYNEXT50.NS',
            'NIFTY Bank': '^NSEBANK',
            'BANK NIFTY': '^NSEBANK',
            'Nifty Financial Services': 'NIFTY_FIN_SERVICE.NS',
            'FIN NIFTY': 'NIFTY_FIN_SERVICE.NS',
            'NIFTY Private Bank': 'NIFTY_PVT_BANK.NS',
            'NIFTY PSU Bank': '^CNXPSU',
            'BSE Bankex': 'BSE-BANK.BO',
            'NIFTY IT': '^CNXIT',
            'BSE FOCUSED IT': 'BSE-IT.BO',
            'NIFTY Pharma': '^CNXPHARMA',
            'NIFTY Auto': '^CNXAUTO',
            'Nifty FMCG': '^CNXFMCG',
            'NIFTY Metal': '^CNXMETAL',
            'NIFTY Realty': '^CNXREALTY',
            'Nifty Media Index': '^CNXMEDIA',
            'NIFTY Commodities': '^CNXCOMMODITIES',
            'BSE IPO': 'BSE-IPO.BO',
            'India VIX': '^INDIAVIX',
            'INDIA VIX': '^INDIAVIX',
            'Nifty Midcap Select': 'NIFTY_MID_SELECT.NS',
            'MIDCAP NIFTY': 'NIFTY_MID_SELECT.NS',
            'NIFTY MIDCAP 50': '^NSEMDCP50',
            'NIFTY Midcap 100': 'NIFTY_MIDCAP_100.NS',
            'NIFTY MIDCAP 150': 'NIFTYMIDCAP150.NS',
            'BSE Midcap': 'BSE-MIDCAP.BO',
            'NIFTY Smallcap 100': 'NIFTYSMLCAP100.NS',
            'NIFTY SMALLCAP 250': 'NIFTYSMLCAP250.NS',
            'BSE Smallcap': 'BSE-SMLCAP.BO',
            'NIFTY 100': '^CNX100',
            'NIFTY 500': '^CRSLDX',
            'Nifty Total Market': 'NIFTYTOTALMKT.NS',
            'BSE 100': 'BSE-100.BO'
        };
        return map[clean] || clean;
    };

    const actualIndexKey = normalizeIndexSymbol(symbol);

    const INDEX_DISPLAY_TITLE_MAP = {
        '^NSEI': 'NIFTY 50',
        '^BSESN': 'BSE SENSEX',
        'NIFTYNEXT50.NS': 'Nifty Next 50',
        '^NSEBANK': 'NIFTY Bank',
        'NIFTY_FIN_SERVICE.NS': 'Nifty Financial Services',
        'NIFTY_PVT_BANK.NS': 'NIFTY Private Bank',
        '^CNXPSU': 'NIFTY PSU Bank',
        'BSE-BANK.BO': 'BSE Bankex',
        '^CNXIT': 'NIFTY IT',
        'BSE-IT.BO': 'BSE FOCUSED IT',
        '^CNXPHARMA': 'NIFTY Pharma',
        '^CNXAUTO': 'NIFTY Auto',
        '^CNXFMCG': 'Nifty FMCG',
        '^CNXMETAL': 'NIFTY Metal',
        '^CNXREALTY': 'NIFTY Realty',
        '^CNXMEDIA': 'Nifty Media Index',
        '^CNXCOMMODITIES': 'NIFTY Commodities',
        'BSE-IPO.BO': 'BSE IPO',
        '^INDIAVIX': 'India VIX',
        'NIFTY_MID_SELECT.NS': 'Nifty Midcap Select',
        '^NSEMDCP50': 'NIFTY MIDCAP 50',
        'NIFTY_MIDCAP_100.NS': 'NIFTY Midcap 100',
        'NIFTYMIDCAP150.NS': 'NIFTY MIDCAP 150',
        'BSE-MIDCAP.BO': 'BSE Midcap',
        'NIFTYSMLCAP100.NS': 'NIFTY Smallcap 100',
        'NIFTYSMLCAP250.NS': 'NIFTY SMALLCAP 250',
        'BSE-SMLCAP.BO': 'BSE Smallcap',
        '^CNX100': 'NIFTY 100',
        'NIFTYTOTALMKT.NS': 'Nifty Total Market',
        'BSE-100.BO': 'BSE 100'
    };

    const m = (symbol || '').match(/^([A-Z\s^]+?)(?:([0-9]{2}[A-Z]{3})([0-9.]+)(CE|PE)|([0-9.]+)(CE|PE)|([0-9]{2}[A-Z]{3})?FUT)$/i);
    const underlyingSymbol = m ? m[1].trim() : symbol;
    const baseTitle = INDEX_DISPLAY_TITLE_MAP[actualIndexKey] || INDEX_DISPLAY_TITLE_MAP[underlyingSymbol] || stockInfo?.name || underlyingSymbol;
    const displaySymbol = INDEX_DISPLAY_TITLE_MAP[actualIndexKey] || INDEX_DISPLAY_TITLE_MAP[symbol] || stockInfo?.name || symbol;
    const companies = INDEX_COMPANIES[actualIndexKey] || INDEX_COMPANIES[underlyingSymbol] || INDEX_COMPANIES[symbol] || INDEX_COMPANIES['^NSEI'];

    // Dynamic F&O Contracts computed directly from real fnoChainData or spot price
    const getTopOptionsData = () => {
        if (fnoChainData && fnoChainData.chain && fnoChainData.chain.length > 0) {
            const list = [];
            fnoChainData.chain.forEach(row => {
                list.push({
                    type: 'Call',
                    strike: row.strike,
                    price: row.ce.ltp,
                    change: row.ce.change_percent,
                    oi: row.ce.oi.toLocaleString(),
                    oiChange: `${row.ce.oi_change >= 0 ? '+' : ''}${row.ce.oi_change}`,
                    volume: row.ce.volume.toLocaleString(),
                    expiry: fnoChainData.selected_expiry || "29 Sep '26",
                    symbol: row.ce.symbol
                });
                list.push({
                    type: 'Put',
                    strike: row.strike,
                    price: row.pe.ltp,
                    change: row.pe.change_percent,
                    oi: row.pe.oi.toLocaleString(),
                    oiChange: `${row.pe.oi_change >= 0 ? '+' : ''}${row.pe.oi_change}`,
                    volume: row.pe.volume.toLocaleString(),
                    expiry: fnoChainData.selected_expiry || "29 Sep '26",
                    symbol: row.pe.symbol
                });
            });
            return list;
        }

        // Fallback calculation using current spot price
        const p = price || 1500;
        const step = p > 50000 ? 500 : p > 20000 ? 100 : p > 5000 ? 50 : p > 1000 ? 20 : p > 500 ? 10 : p > 100 ? 5 : 1;
        const atm = Math.round(p / step) * step;
        const strikes = [atm - step * 2, atm - step, atm, atm + step, atm + step * 2];
        const list = [];
        const fallbackExp = "29 Sep '26";
        const fallbackExpCode = "29SEP";
        strikes.forEach(s => {
            const ceLtp = roundNum(Math.max(2, Math.abs(p - s) * 0.05 + p * 0.015));
            const peLtp = roundNum(Math.max(2, Math.abs(s - p) * 0.05 + p * 0.015));
            list.push({
                type: 'Call',
                strike: s,
                price: ceLtp,
                change: 2.15,
                oi: (Math.round(p * 12)).toLocaleString(),
                oiChange: '+12.4%',
                volume: (Math.round(p * 18)).toLocaleString(),
                expiry: fallbackExp,
                symbol: `${symbol}${fallbackExpCode}${s}CE`
            });
            list.push({
                type: 'Put',
                strike: s,
                price: peLtp,
                change: -1.85,
                oi: (Math.round(p * 15)).toLocaleString(),
                oiChange: '+14.1%',
                volume: (Math.round(p * 22)).toLocaleString(),
                expiry: fallbackExp,
                symbol: `${symbol}${fallbackExpCode}${s}PE`
            });
        });
        return list;
    };

    const topOptionsData = getTopOptionsData();
    const filteredOptions = topOptionsData.filter(o => optionFilter === 'All' ? true : o.type === optionFilter);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* 1. TOP HEADER TOOLBAR ROW (Symbol, Price, Change Badge, Action Buttons) */}
            <div className="soft-card" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <StockLogo symbol={symbol} name={displaySymbol} size={48} />
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                {displaySymbol}
                            </h1>
                            <span style={{ fontSize: '11px', background: '#1e2c45', color: 'var(--accent-primary)', padding: '2px 8px', borderRadius: '4px', fontWeight: '700' }}>NSE</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                            <span style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                ₹{price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                            <span style={{
                                fontSize: '14px',
                                fontWeight: '700',
                                color: isPositive ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                                background: isPositive ? 'var(--accent-emerald-soft)' : 'var(--accent-rose-soft)',
                                padding: '3px 8px',
                                borderRadius: '6px'
                            }}>
                                {isPositive ? '+' : '-'}{Math.abs(change).toFixed(2)} ({isPositive ? '+' : '-'}{Math.abs(changePercent).toFixed(2)}%) <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>1D</span>
                            </span>
                        </div>
                    </div>
                </div>

                {/* Top Action Buttons: ⏰ Create Alert | 🔖 Watchlist | 🔗 Option Chain */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                        onClick={handleCreateAlert}
                        style={{
                            background: alertSet ? 'var(--accent-emerald-soft)' : '#111927',
                            color: alertSet ? 'var(--accent-emerald)' : 'var(--text-primary)',
                            border: '1px solid var(--border-color)',
                            padding: '8px 14px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '700',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <span>⏰</span>
                        <span>{alertSet ? 'Alert Set' : 'Create Alert'}</span>
                    </button>

                    <button
                        onClick={toggleWatchlist}
                        style={{
                            background: isStarred ? 'var(--accent-primary-soft)' : '#111927',
                            color: isStarred ? 'var(--accent-primary)' : 'var(--text-primary)',
                            border: '1px solid var(--border-color)',
                            padding: '8px 14px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '700',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <span>{isStarred ? '⭐' : '🔖'}</span>
                        <span>{isStarred ? 'Watchlisted' : 'Watchlist'}</span>
                    </button>

                    <button
                        onClick={() => setShowOptionChainModal(true)}
                        style={{
                            background: 'transparent',
                            color: 'var(--accent-emerald)',
                            border: '1px solid var(--accent-emerald)',
                            padding: '8px 14px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '700',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <span>🔗</span>
                        <span>Option Chain</span>
                    </button>
                </div>
            </div>

            {/* 2. TOP PRIORITY #1: INTERACTIVE GRAPH (PRICE CHART) RIGHT BELOW HEADER */}
            <PriceChart 
                symbol={symbol} 
                portfolio={portfolio}
                onSell={onSell}
                onBuy={onBuy}
                showToast={showToast}
            />

            {/* 3. SUB-NAVIGATION TABS BELOW GRAPH (Overview | F&O | ETFs) */}
            <div style={{ display: 'flex', gap: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
                {[
                    { id: 'overview', label: 'Overview' },
                    { id: 'fno', label: 'F&O' },
                    { id: 'etfs', label: 'ETFs' }
                ].map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                borderBottom: isActive ? '3px solid var(--accent-emerald)' : '3px solid transparent',
                                color: isActive ? 'var(--accent-emerald)' : 'var(--text-secondary)',
                                fontSize: '16px',
                                fontWeight: isActive ? '800' : '600',
                                padding: '8px 12px',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* 4. MAIN CONTENT LAYOUT SPLIT: LEFT DETAILS VIEW + RIGHT SIDEBAR */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                
                {/* Left Column View */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', flex: 2 }}>
                    
                    {/* TAB 1: OVERVIEW VIEW */}
                    {activeTab === 'overview' && (
                        <>
                            {/* Performance Section (Today's Low/High Range Line & 52W Low/High Range Line) */}
                            <div className="soft-card" style={{ padding: '24px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
                                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                        Performance
                                    </h3>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '14px', cursor: 'pointer' }}>ℹ️</span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                    {/* Today's Low / High Range Slider Line */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                            <div>
                                                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Today's Low</div>
                                                <div style={{ fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>₹{dayLow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Today's High</div>
                                                <div style={{ fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>₹{dayHigh.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Open</div>
                                                <div style={{ fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>₹{openPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                                            </div>
                                        </div>
                                        {/* Slider Line with Current Price Indicator Pointer */}
                                        <div style={{ position: 'relative', height: '6px', background: '#212e44', borderRadius: '3px', margin: '14px 0' }}>
                                            <div style={{
                                                position: 'absolute',
                                                top: '-6px',
                                                left: `${rangePercent(price, dayLow, dayHigh)}%`,
                                                transform: 'translateX(-50%)',
                                                fontSize: '12px',
                                                color: 'var(--accent-primary)'
                                            }}>
                                                ▲
                                            </div>
                                        </div>
                                    </div>

                                    {/* 52W Low / High Range Slider Line */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                            <div>
                                                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>52W Low</div>
                                                <div style={{ fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>₹{fiftyTwoLow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>52W High</div>
                                                <div style={{ fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>₹{fiftyTwoHigh.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Prev. Close</div>
                                                <div style={{ fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>₹{prevClose.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                                            </div>
                                        </div>
                                        {/* Slider Line with Current Price Indicator Pointer */}
                                        <div style={{ position: 'relative', height: '6px', background: '#212e44', borderRadius: '3px', margin: '14px 0' }}>
                                            <div style={{
                                                position: 'absolute',
                                                top: '-6px',
                                                left: `${rangePercent(price, fiftyTwoLow, fiftyTwoHigh)}%`,
                                                transform: 'translateX(-50%)',
                                                fontSize: '12px',
                                                color: 'var(--accent-primary)'
                                            }}>
                                                ▲
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 5-Level Market Depth (Level 2 Order Book) */}
                            {(() => {
                                const p = price || 1000;
                                const tick = p > 5000 ? 0.5 : p > 1000 ? 0.1 : 0.05;
                                const bids = [
                                    { orders: 14, qty: 1450, price: roundNum(p - tick * 1) },
                                    { orders: 9, qty: 980, price: roundNum(p - tick * 2) },
                                    { orders: 18, qty: 2200, price: roundNum(p - tick * 3) },
                                    { orders: 6, qty: 650, price: roundNum(p - tick * 4) },
                                    { orders: 22, qty: 3100, price: roundNum(p - tick * 5) }
                                ];
                                const asks = [
                                    { orders: 11, qty: 1200, price: roundNum(p + tick * 1) },
                                    { orders: 15, qty: 1850, price: roundNum(p + tick * 2) },
                                    { orders: 8, qty: 890, price: roundNum(p + tick * 3) },
                                    { orders: 19, qty: 2600, price: roundNum(p + tick * 4) },
                                    { orders: 27, qty: 3400, price: roundNum(p + tick * 5) }
                                ];
                                const totalBidQty = bids.reduce((acc, b) => acc + b.qty, 0);
                                const totalAskQty = asks.reduce((acc, a) => acc + a.qty, 0);
                                const buyPct = Math.round((totalBidQty / (totalBidQty + totalAskQty)) * 100);
                                const sellPct = 100 - buyPct;
                                const maxQty = Math.max(...bids.map(b => b.qty), ...asks.map(a => a.qty));

                                return (
                                    <div className="soft-card" style={{ padding: '24px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                                📊 Market Depth (Order Book)
                                            </h3>
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: '#111927', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                                Level 2 Live
                                            </span>
                                        </div>

                                        {/* Total Buy / Sell Ratio Bar */}
                                        <div style={{ marginBottom: '16px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '700', marginBottom: '6px' }}>
                                                <span style={{ color: 'var(--accent-emerald)' }}>Buy {buyPct}% ({totalBidQty.toLocaleString()})</span>
                                                <span style={{ color: 'var(--accent-rose)' }}>Sell {sellPct}% ({totalAskQty.toLocaleString()})</span>
                                            </div>
                                            <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{ width: `${buyPct}%`, background: 'var(--accent-emerald)' }} />
                                                <div style={{ width: `${sellPct}%`, background: 'var(--accent-rose)' }} />
                                            </div>
                                        </div>

                                        {/* 5-Level Depth Table */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', overflowX: 'auto' }}>
                                            {/* Bid Side */}
                                            <div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', textTransform: 'uppercase' }}>
                                                    <span>Orders</span>
                                                    <span style={{ textAlign: 'right' }}>Qty</span>
                                                    <span style={{ textAlign: 'right' }}>Bid Price</span>
                                                </div>
                                                {bids.map((b, idx) => (
                                                    <div key={idx} style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '6px 0', fontSize: '12px', borderBottom: '1px solid #1c2738' }}>
                                                        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${(b.qty / maxQty) * 100}%`, background: 'rgba(0, 208, 156, 0.12)', zIndex: 0 }} />
                                                        <span style={{ position: 'relative', zIndex: 1, color: 'var(--text-muted)' }}>{b.orders}</span>
                                                        <span style={{ position: 'relative', zIndex: 1, textAlign: 'right', fontWeight: '600', color: 'var(--text-secondary)' }}>{b.qty.toLocaleString()}</span>
                                                        <span style={{ position: 'relative', zIndex: 1, textAlign: 'right', fontWeight: '800', color: 'var(--accent-emerald)' }}>₹{b.price.toFixed(2)}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Ask Side */}
                                            <div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', textTransform: 'uppercase' }}>
                                                    <span>Ask Price</span>
                                                    <span style={{ textAlign: 'right' }}>Qty</span>
                                                    <span style={{ textAlign: 'right' }}>Orders</span>
                                                </div>
                                                {asks.map((a, idx) => (
                                                    <div key={idx} style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '6px 0', fontSize: '12px', borderBottom: '1px solid #1c2738' }}>
                                                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(a.qty / maxQty) * 100}%`, background: 'rgba(235, 91, 86, 0.12)', zIndex: 0 }} />
                                                        <span style={{ position: 'relative', zIndex: 1, fontWeight: '800', color: 'var(--accent-rose)' }}>₹{a.price.toFixed(2)}</span>
                                                        <span style={{ position: 'relative', zIndex: 1, textAlign: 'right', fontWeight: '600', color: 'var(--text-secondary)' }}>{a.qty.toLocaleString()}</span>
                                                        <span style={{ position: 'relative', zIndex: 1, textAlign: 'right', color: 'var(--text-muted)' }}>{a.orders}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Support and Resistance Section (Pivot Levels R1, R2, R3, S1, S2, S3) */}
                            <div className="soft-card" style={{ padding: '24px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
                                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                        Support and Resistance
                                    </h3>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '14px', cursor: 'pointer' }}>ℹ️</span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative', padding: '10px 0' }}>
                                    {[
                                        { label: 'R3', val: r3 },
                                        { label: 'R2', val: r2 },
                                        { label: 'R1', val: r1 },
                                        { label: `PIVOT ${pivot}`, val: pivot, isPivot: true },
                                        { label: `PRICE ${price}`, val: price, isPrice: true },
                                        { label: 'S1', val: s1 },
                                        { label: 'S2', val: s2 },
                                        { label: 'S3', val: s3 }
                                    ].map((row, idx) => (
                                        <div
                                            key={idx}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '6px 12px',
                                                borderRadius: '6px',
                                                background: row.isPrice ? '#2e4161' : row.isPivot ? '#1e2c45' : 'transparent',
                                                borderLeft: row.isPrice ? '4px solid var(--accent-emerald)' : row.isPivot ? '4px solid var(--accent-primary)' : 'none'
                                            }}
                                        >
                                            <span style={{ fontSize: '12px', fontWeight: '700', color: row.isPrice || row.isPivot ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                                {row.label}
                                            </span>
                                            <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                                ₹{row.val.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Constituent Companies Section (Scrollable All 50 NIFTY Companies List, Clickable to open stock option chart) */}
                            <div className="soft-card" style={{ padding: '24px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                        {displaySymbol} Companies ({companies.length})
                                    </h3>
                                    <span style={{ fontSize: '12px', color: 'var(--accent-primary)', fontWeight: '600' }}>
                                        💡 Click any company row to open its full stock chart & options
                                    </span>
                                </div>

                                <div style={{ overflowX: 'auto', maxHeight: '480px', overflowY: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                        <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                                            <tr style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', borderBottom: '1px solid var(--border-color)', background: '#111927' }}>
                                                <th style={{ padding: '12px 16px' }}>COMPANY</th>
                                                <th style={{ padding: '12px 16px', textAlign: 'right' }}>MARKET CAP</th>
                                                <th style={{ padding: '12px 16px', textAlign: 'right' }}>MARKET PRICE</th>
                                                <th style={{ padding: '12px 16px', textAlign: 'center' }}>SECTOR</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {companies.map((comp) => (
                                                <tr 
                                                    key={comp.symbol || comp.name} 
                                                    onClick={() => onSelectStock(comp.symbol || comp.name)}
                                                    style={{ 
                                                        borderBottom: '1px solid var(--border-color)', 
                                                        cursor: 'pointer',
                                                        transition: 'background-color 0.15s ease' 
                                                    }}
                                                    className="company-table-row"
                                                >
                                                    <td style={{ padding: '12px 16px', fontWeight: '700', color: 'var(--text-primary)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span>{comp.name}</span>
                                                            <span style={{ fontSize: '10px', background: '#1e2c45', color: 'var(--accent-primary)', padding: '2px 6px', borderRadius: '4px' }}>
                                                                {comp.symbol}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: 'var(--text-secondary)' }}>
                                                        {comp.mcap}
                                                    </td>
                                                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '800', color: 'var(--text-primary)' }}>
                                                        {comp.price}
                                                        <div style={{ fontSize: '11px', fontWeight: '700', color: comp.change.startsWith('+') ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                                                            {comp.change}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                                                        {comp.sector}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                    {/* TAB 2: F&O VIEW */}
                    {activeTab === 'fno' && (
                        <>
                            {/* Option Chain Card Link */}
                            <div 
                                onClick={() => setShowOptionChainModal(true)}
                                className="soft-card" 
                                style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', borderColor: 'var(--accent-emerald)' }}
                            >
                                <span style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                    {displaySymbol} Option Chain
                                </span>
                                <span style={{ fontSize: '18px', color: 'var(--accent-emerald)', fontWeight: '800' }}>❯</span>
                            </div>

                            {/* Open Interest (OI) Summary Cards */}
                            <div className="soft-card" style={{ padding: '20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                        Open Interest (OI)
                                    </h3>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>ℹ️</span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', textAlign: 'center' }}>
                                    <div style={{ background: '#111927', padding: '14px', borderRadius: '8px' }}>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Put OI</div>
                                        <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--accent-emerald)', marginTop: '4px' }}>
                                            {fnoChainData?.total_pe_oi ? fnoChainData.total_pe_oi.toLocaleString() : (Math.round((price || 1500) * 1420)).toLocaleString()}
                                        </div>
                                    </div>
                                    <div style={{ background: '#111927', padding: '14px', borderRadius: '8px' }}>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Put:Call ratio</div>
                                        <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--accent-primary)', marginTop: '4px' }}>
                                            {fnoChainData?.pcr !== undefined ? fnoChainData.pcr : (0.85 + ((price || 1500) % 100) / 500).toFixed(2)}
                                        </div>
                                    </div>
                                    <div style={{ background: '#111927', padding: '14px', borderRadius: '8px' }}>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Call OI</div>
                                        <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--accent-rose)', marginTop: '4px' }}>
                                            {fnoChainData?.total_ce_oi ? fnoChainData.total_ce_oi.toLocaleString() : (Math.round((price || 1500) * 1580)).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Futures Contracts Cards */}
                            <div>
                                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                    {displaySymbol} Futures
                                </h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                                    {(() => {
                                        const nearExp = fnoChainData?.expiries?.[0] || "29-Sep-2026";
                                        const farExp = fnoChainData?.expiries?.[1] || "27-Oct-2026";
                                        const nearCode = nearExp.slice(0, 2) + nearExp.slice(3, 6).toUpperCase();
                                        const farCode = farExp.slice(0, 2) + farExp.slice(3, 6).toUpperCase();
                                        return (
                                            <>
                                                <div 
                                                    onClick={() => onSelectStock(`${symbol}${nearCode}FUT`)}
                                                    className="soft-card" 
                                                    style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                                                >
                                                    <div>
                                                        <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>{displaySymbol} Near Fut</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{nearExp}</div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontWeight: '800', fontSize: '15px', color: 'var(--text-primary)' }}>
                                                            ₹{((price || 1500) * 1.0022).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                        </div>
                                                        <div style={{ fontSize: '11px', fontWeight: '700', color: isPositive ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                                                            {isPositive ? '+' : ''}{change.toFixed(2)} ({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)
                                                        </div>
                                                    </div>
                                                </div>
                                                <div 
                                                    onClick={() => onSelectStock(`${symbol}${farCode}FUT`)}
                                                    className="soft-card" 
                                                    style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                                                >
                                                    <div>
                                                        <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>{displaySymbol} Far Fut</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{farExp}</div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontWeight: '800', fontSize: '15px', color: 'var(--text-primary)' }}>
                                                            ₹{((price || 1500) * 1.0058).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                        </div>
                                                        <div style={{ fontSize: '11px', fontWeight: '700', color: isPositive ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                                                            {isPositive ? '+' : ''}{(change * 1.003).toFixed(2)} ({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>

                            {/* Top Options Table */}
                            <div className="soft-card" style={{ padding: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                        Top {displaySymbol} Options
                                    </h3>
                                    <div style={{ display: 'flex', gap: '6px', background: '#111927', padding: '3px', borderRadius: '8px' }}>
                                        {['All', 'Put', 'Call'].map((f) => (
                                            <button
                                                key={f}
                                                onClick={() => setOptionFilter(f)}
                                                style={{
                                                    padding: '4px 10px',
                                                    borderRadius: '6px',
                                                    background: optionFilter === f ? 'var(--accent-primary)' : 'transparent',
                                                    color: optionFilter === f ? '#ffffff' : 'var(--text-secondary)',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    fontSize: '11px',
                                                    fontWeight: '700'
                                                }}
                                            >
                                                {f}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', borderBottom: '1px solid var(--border-color)', background: '#111927' }}>
                                                <th style={{ padding: '10px 14px' }}>CONTRACT</th>
                                                <th style={{ padding: '10px 14px', textAlign: 'right' }}>PRICE</th>
                                                <th style={{ padding: '10px 14px', textAlign: 'right' }}>OI</th>
                                                <th style={{ padding: '10px 14px', textAlign: 'right' }}>VOLUME</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredOptions.map((opt, idx) => (
                                                <tr 
                                                    key={idx} 
                                                    onClick={() => onSelectStock && onSelectStock(opt.symbol)}
                                                    style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                                                >
                                                    <td style={{ padding: '10px 14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                                                        {baseTitle} {opt.strike} <span style={{ color: opt.type === 'Call' ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>{opt.type}</span>
                                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{opt.expiry}</div>
                                                    </td>
                                                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '800', color: 'var(--text-primary)' }}>
                                                        ₹{opt.price.toFixed(2)}
                                                        <div style={{ fontSize: '10px', fontWeight: '700', color: opt.change >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                                                            {opt.change >= 0 ? '+' : ''}{opt.change.toFixed(2)}%
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '600', color: 'var(--text-secondary)' }}>
                                                        {opt.oi}
                                                        <div style={{ fontSize: '10px', color: 'var(--accent-emerald)', fontWeight: '700' }}>{opt.oiChange}</div>
                                                    </td>
                                                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '600', color: 'var(--text-muted)' }}>
                                                        {opt.volume}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                    {/* TAB 3: ETFs VIEW */}
                    {activeTab === 'etfs' && (
                        <div className="soft-card" style={{ padding: '24px' }}>
                            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                Popular ETFs Tracking {baseTitle}
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {[
                                    { name: 'Nippon India ETF Nifty 50 BeES', symbol: 'NIFTYBEES', price: 268.40, change: '+0.12%', oneYr: '+18.4%' },
                                    { name: 'SBI Nifty 50 ETF', symbol: 'SETFNIF50', price: 271.10, change: '+0.10%', oneYr: '+18.2%' },
                                    { name: 'ICICI Prudential Nifty 50 ETF', symbol: 'ICICINIFTY', price: 269.80, change: '+0.15%', oneYr: '+18.5%' },
                                    { name: 'UTI Nifty 50 Exchange Traded Fund', symbol: 'UTINIFTYSUM', price: 270.50, change: '+0.08%', oneYr: '+18.1%' }
                                ].map((etf) => (
                                    <div key={etf.symbol} style={{ padding: '14px', background: '#111927', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>{etf.name}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{etf.symbol}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontWeight: '800', fontSize: '15px', color: 'var(--text-primary)' }}>₹{etf.price.toFixed(2)}</div>
                                            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-emerald)' }}>1Y Return: {etf.oneYr}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Sidebar Column: Top Options Card (Dynamic per-stock) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
                    
                    {/* Top Options Widget Card */}
                    <div className="soft-card" style={{ padding: '20px' }}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>
                            Top {baseTitle} Options
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {filteredOptions.slice(0, 10).map((opt, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => onSelectStock && onSelectStock(opt.symbol)}
                                    style={{
                                        padding: '12px 14px',
                                        background: '#111927',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        border: '1px solid var(--border-color)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)' }}>
                                            {baseTitle} {opt.strike} <span style={{ color: opt.type === 'Call' ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>{opt.type}</span>
                                        </div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{opt.expiry}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: '800', fontSize: '14px', color: 'var(--text-primary)' }}>
                                            ₹{opt.price.toFixed(2)}
                                        </div>
                                        <div style={{ fontSize: '11px', fontWeight: '700', color: opt.change >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                                            {opt.change >= 0 ? '+' : ''}{opt.change.toFixed(2)}%
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>

            </div>

            {/* Real-Time Option Chain Modal */}
            {showOptionChainModal && (
                <OptionChainModal
                    isOpen={showOptionChainModal}
                    onClose={() => setShowOptionChainModal(false)}
                    symbol={underlyingSymbol}
                    onSelectContract={(contractSym, action, contractPrice) => {
                        if (onSelectStock) onSelectStock(contractSym);
                        if (showToast) showToast(`Selected ${contractSym} @ ₹${contractPrice}`);
                    }}
                />
            )}
        </div>
    );
};

const roundNum = (val) => Math.round((val + Number.EPSILON) * 100) / 100;

export default StockDetails;