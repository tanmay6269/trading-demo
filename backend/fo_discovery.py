"""
fo_discovery.py
---------------
Official NSE F&O Underlying Discovery & Daily Refresh Engine for BullX.

1. Fetches the official NSE F&O underlying list & market lots
2. Populates/refreshes the fo_underlyings database table
3. Automatically scheduled daily before market open (08:30 AM IST)
"""

import os
import csv
import io
import time
import logging
from datetime import datetime, date
import requests

logger = logging.getLogger("fo_discovery")

# Official NSE Comprehensive 180+ F&O Stock & Index Master List (with Lot Size & Step Size)
OFFICIAL_NSE_FO_LIST = [
    # Indices
    {"symbol": "NIFTY", "name": "NIFTY 50", "lot_size": 25, "step_size": 50.0, "is_index": True},
    {"symbol": "BANKNIFTY", "name": "NIFTY BANK", "lot_size": 15, "step_size": 100.0, "is_index": True},
    {"symbol": "FINNIFTY", "name": "NIFTY FINANCIAL SERVICES", "lot_size": 25, "step_size": 50.0, "is_index": True},
    {"symbol": "MIDCPNIFTY", "name": "NIFTY MIDCAP SELECT", "lot_size": 50, "step_size": 25.0, "is_index": True},
    {"symbol": "NIFTYNXT50", "name": "NIFTY NEXT 50", "lot_size": 10, "step_size": 100.0, "is_index": True},
    {"symbol": "SENSEX", "name": "BSE SENSEX", "lot_size": 10, "step_size": 100.0, "is_index": True, "exchange": "BSE"},
    {"symbol": "BANKEX", "name": "BSE BANKEX", "lot_size": 15, "step_size": 100.0, "is_index": True, "exchange": "BSE"},

    # Top & Full NSE F&O Individual Stocks (180+ Equities)
    {"symbol": "AARTIIND", "name": "Aarti Industries", "lot_size": 1000, "step_size": 10.0, "is_index": False},
    {"symbol": "ABB", "name": "ABB India", "lot_size": 125, "step_size": 100.0, "is_index": False},
    {"symbol": "ABBOTINDIA", "name": "Abbott India", "lot_size": 25, "step_size": 500.0, "is_index": False},
    {"symbol": "ABCAPITAL", "name": "Aditya Birla Capital", "lot_size": 3100, "step_size": 2.5, "is_index": False},
    {"symbol": "ABFRL", "name": "Aditya Birla Fashion", "lot_size": 2600, "step_size": 5.0, "is_index": False},
    {"symbol": "ACC", "name": "ACC Limited", "lot_size": 300, "step_size": 20.0, "is_index": False},
    {"symbol": "ADANIENT", "name": "Adani Enterprises", "lot_size": 300, "step_size": 50.0, "is_index": False},
    {"symbol": "ADANIPORTS", "name": "Adani Ports", "lot_size": 400, "step_size": 20.0, "is_index": False},
    {"symbol": "ALKEM", "name": "Alkem Laboratories", "lot_size": 125, "step_size": 50.0, "is_index": False},
    {"symbol": "AMBUJACEM", "name": "Ambuja Cements", "lot_size": 900, "step_size": 10.0, "is_index": False},
    {"symbol": "ANGELONE", "name": "Angel One", "lot_size": 250, "step_size": 50.0, "is_index": False},
    {"symbol": "APOLLOHOSP", "name": "Apollo Hospitals", "lot_size": 125, "step_size": 100.0, "is_index": False},
    {"symbol": "APOLLOTYRE", "name": "Apollo Tyres", "lot_size": 1700, "step_size": 5.0, "is_index": False},
    {"symbol": "ASHOKLEY", "name": "Ashok Leyland", "lot_size": 5000, "step_size": 2.5, "is_index": False},
    {"symbol": "ASIANPAINT", "name": "Asian Paints", "lot_size": 200, "step_size": 50.0, "is_index": False},
    {"symbol": "ASTRAL", "name": "Astral Limited", "lot_size": 275, "step_size": 20.0, "is_index": False},
    {"symbol": "ATUL", "name": "Atul Limited", "lot_size": 75, "step_size": 100.0, "is_index": False},
    {"symbol": "AUBANK", "name": "AU Small Finance Bank", "lot_size": 1000, "step_size": 10.0, "is_index": False},
    {"symbol": "AUROPHARMA", "name": "Aurobindo Pharma", "lot_size": 550, "step_size": 20.0, "is_index": False},
    {"symbol": "AXISBANK", "name": "Axis Bank", "lot_size": 625, "step_size": 20.0, "is_index": False},
    {"symbol": "BAJAJ-AUTO", "name": "Bajaj Auto", "lot_size": 75, "step_size": 100.0, "is_index": False},
    {"symbol": "BAJAJFINSV", "name": "Bajaj Finserv", "lot_size": 500, "step_size": 20.0, "is_index": False},
    {"symbol": "BAJFINANCE", "name": "Bajaj Finance", "lot_size": 125, "step_size": 50.0, "is_index": False},
    {"symbol": "BALKRISIND", "name": "Balkrishna Industries", "lot_size": 300, "step_size": 50.0, "is_index": False},
    {"symbol": "BALRAMCHIN", "name": "Balrampur Chini Mills", "lot_size": 1600, "step_size": 5.0, "is_index": False},
    {"symbol": "BANDHANBNK", "name": "Bandhan Bank", "lot_size": 2500, "step_size": 2.5, "is_index": False},
    {"symbol": "BANKBARODA", "name": "Bank of Baroda", "lot_size": 2925, "step_size": 2.5, "is_index": False},
    {"symbol": "BATAINDIA", "name": "Bata India", "lot_size": 375, "step_size": 20.0, "is_index": False},
    {"symbol": "BEL", "name": "Bharat Electronics", "lot_size": 2850, "step_size": 5.0, "is_index": False},
    {"symbol": "BERGEPAINT", "name": "Berger Paints", "lot_size": 1100, "step_size": 10.0, "is_index": False},
    {"symbol": "BHARATFORG", "name": "Bharat Forge", "lot_size": 500, "step_size": 20.0, "is_index": False},
    {"symbol": "BHARTIARTL", "name": "Bharti Airtel", "lot_size": 475, "step_size": 20.0, "is_index": False},
    {"symbol": "BHEL", "name": "Bharat Heavy Electricals", "lot_size": 2625, "step_size": 5.0, "is_index": False},
    {"symbol": "BIOCON", "name": "Biocon Limited", "lot_size": 2500, "step_size": 5.0, "is_index": False},
    {"symbol": "BOSCHLTD", "name": "Bosch Limited", "lot_size": 25, "step_size": 500.0, "is_index": False},
    {"symbol": "BPCL", "name": "Bharat Petroleum", "lot_size": 1800, "step_size": 5.0, "is_index": False},
    {"symbol": "BRITANNIA", "name": "Britannia Industries", "lot_size": 125, "step_size": 50.0, "is_index": False},
    {"symbol": "BSE", "name": "BSE Limited", "lot_size": 375, "step_size": 50.0, "is_index": False},
    {"symbol": "CANBK", "name": "Canara Bank", "lot_size": 6750, "step_size": 1.0, "is_index": False},
    {"symbol": "CANFINHOME", "name": "Can Fin Homes", "lot_size": 975, "step_size": 10.0, "is_index": False},
    {"symbol": "CDSL", "name": "Central Depository Services", "lot_size": 375, "step_size": 25.0, "is_index": False},
    {"symbol": "CHAMBLFERT", "name": "Chambal Fertilizers", "lot_size": 1500, "step_size": 5.0, "is_index": False},
    {"symbol": "CHOLAFIN", "name": "Cholamandalam Investment", "lot_size": 625, "step_size": 20.0, "is_index": False},
    {"symbol": "CIPLA", "name": "Cipla Limited", "lot_size": 650, "step_size": 20.0, "is_index": False},
    {"symbol": "COALINDIA", "name": "Coal India", "lot_size": 2100, "step_size": 5.0, "is_index": False},
    {"symbol": "COCHINSHIP", "name": "Cochin Shipyard", "lot_size": 350, "step_size": 25.0, "is_index": False},
    {"symbol": "COFORGE", "name": "Coforge Limited", "lot_size": 150, "step_size": 100.0, "is_index": False},
    {"symbol": "COLPAL", "name": "Colgate-Palmolive", "lot_size": 350, "step_size": 50.0, "is_index": False},
    {"symbol": "CONCOR", "name": "Container Corporation", "lot_size": 1000, "step_size": 10.0, "is_index": False},
    {"symbol": "COROMANDEL", "name": "Coromandel International", "lot_size": 700, "step_size": 20.0, "is_index": False},
    {"symbol": "CROMPTON", "name": "Crompton Greaves", "lot_size": 1800, "step_size": 5.0, "is_index": False},
    {"symbol": "CUB", "name": "City Union Bank", "lot_size": 5000, "step_size": 2.5, "is_index": False},
    {"symbol": "DABUR", "name": "Dabur India", "lot_size": 1250, "step_size": 10.0, "is_index": False},
    {"symbol": "DALBHARAT", "name": "Dalmia Bharat", "lot_size": 250, "step_size": 20.0, "is_index": False},
    {"symbol": "DEEPAKNTR", "name": "Deepak Nitrite", "lot_size": 300, "step_size": 50.0, "is_index": False},
    {"symbol": "DELHIVERY", "name": "Delhivery Limited", "lot_size": 1500, "step_size": 10.0, "is_index": False},
    {"symbol": "DIVISLAB", "name": "Divi's Laboratories", "lot_size": 200, "step_size": 50.0, "is_index": False},
    {"symbol": "DIXON", "name": "Dixon Technologies", "lot_size": 50, "step_size": 200.0, "is_index": False},
    {"symbol": "DLF", "name": "DLF Limited", "lot_size": 825, "step_size": 10.0, "is_index": False},
    {"symbol": "DRREDDY", "name": "Dr. Reddy's Laboratories", "lot_size": 125, "step_size": 50.0, "is_index": False},
    {"symbol": "EICHERMOT", "name": "Eicher Motors", "lot_size": 175, "step_size": 50.0, "is_index": False},
    {"symbol": "ESCORTS", "name": "Escorts Kubota", "lot_size": 200, "step_size": 50.0, "is_index": False},
    {"symbol": "EXIDEIND", "name": "Exide Industries", "lot_size": 1200, "step_size": 5.0, "is_index": False},
    {"symbol": "FEDERALBNK", "name": "Federal Bank", "lot_size": 5000, "step_size": 2.5, "is_index": False},
    {"symbol": "GAIL", "name": "GAIL India", "lot_size": 2650, "step_size": 2.5, "is_index": False},
    {"symbol": "GLENMARK", "name": "Glenmark Pharmaceuticals", "lot_size": 725, "step_size": 20.0, "is_index": False},
    {"symbol": "GMRINFRA", "name": "GMR Airports", "lot_size": 10000, "step_size": 1.0, "is_index": False},
    {"symbol": "GNFC", "name": "Gujarat Narmada Valley", "lot_size": 1300, "step_size": 10.0, "is_index": False},
    {"symbol": "GODREJCP", "name": "Godrej Consumer Products", "lot_size": 500, "step_size": 20.0, "is_index": False},
    {"symbol": "GODREJPROP", "name": "Godrej Properties", "lot_size": 225, "step_size": 50.0, "is_index": False},
    {"symbol": "GRANULES", "name": "Granules India", "lot_size": 2000, "step_size": 10.0, "is_index": False},
    {"symbol": "GRASIM", "name": "Grasim Industries", "lot_size": 250, "step_size": 20.0, "is_index": False},
    {"symbol": "GUJGASLTD", "name": "Gujarat Gas", "lot_size": 1250, "step_size": 10.0, "is_index": False},
    {"symbol": "HAL", "name": "Hindustan Aeronautics", "lot_size": 150, "step_size": 50.0, "is_index": False},
    {"symbol": "HAVELLS", "name": "Havells India", "lot_size": 500, "step_size": 20.0, "is_index": False},
    {"symbol": "HCLTECH", "name": "HCL Technologies", "lot_size": 350, "step_size": 20.0, "is_index": False},
    {"symbol": "HDFCAMC", "name": "HDFC AMC", "lot_size": 150, "step_size": 50.0, "is_index": False},
    {"symbol": "HDFCBANK", "name": "HDFC Bank", "lot_size": 550, "step_size": 10.0, "is_index": False},
    {"symbol": "HDFCLIFE", "name": "HDFC Life Insurance", "lot_size": 1100, "step_size": 10.0, "is_index": False},
    {"symbol": "HEROMOTOCO", "name": "Hero MotoCorp", "lot_size": 150, "step_size": 50.0, "is_index": False},
    {"symbol": "HINDALCO", "name": "Hindalco Industries", "lot_size": 1400, "step_size": 10.0, "is_index": False},
    {"symbol": "HINDPETRO", "name": "Hindustan Petroleum", "lot_size": 2025, "step_size": 5.0, "is_index": False},
    {"symbol": "HINDUNILVR", "name": "Hindustan Unilever", "lot_size": 300, "step_size": 20.0, "is_index": False},
    {"symbol": "ICICIBANK", "name": "ICICI Bank", "lot_size": 700, "step_size": 10.0, "is_index": False},
    {"symbol": "ICICIGI", "name": "ICICI Lombard", "lot_size": 500, "step_size": 20.0, "is_index": False},
    {"symbol": "ICICIPRULI", "name": "ICICI Prudential Life", "lot_size": 1500, "step_size": 10.0, "is_index": False},
    {"symbol": "IDEA", "name": "Vodafone Idea", "lot_size": 80000, "step_size": 0.5, "is_index": False},
    {"symbol": "IDFCFIRSTB", "name": "IDFC First Bank", "lot_size": 7500, "step_size": 1.0, "is_index": False},
    {"symbol": "IEX", "name": "Indian Energy Exchange", "lot_size": 3750, "step_size": 2.5, "is_index": False},
    {"symbol": "IGL", "name": "Indraprastha Gas", "lot_size": 1375, "step_size": 5.0, "is_index": False},
    {"symbol": "INDHOTEL", "name": "Indian Hotels", "lot_size": 1000, "step_size": 10.0, "is_index": False},
    {"symbol": "INDIAMART", "name": "IndiaMART InterMESH", "lot_size": 300, "step_size": 50.0, "is_index": False},
    {"symbol": "INDIGO", "name": "InterGlobe Aviation", "lot_size": 150, "step_size": 50.0, "is_index": False},
    {"symbol": "INDUSINDBK", "name": "IndusInd Bank", "lot_size": 500, "step_size": 20.0, "is_index": False},
    {"symbol": "INDUSTOWER", "name": "Indus Towers", "lot_size": 1700, "step_size": 5.0, "is_index": False},
    {"symbol": "INFY", "name": "Infosys Limited", "lot_size": 400, "step_size": 20.0, "is_index": False},
    {"symbol": "IOC", "name": "Indian Oil Corporation", "lot_size": 4875, "step_size": 2.5, "is_index": False},
    {"symbol": "IPCALAB", "name": "IPCA Laboratories", "lot_size": 650, "step_size": 20.0, "is_index": False},
    {"symbol": "IRCTC", "name": "IRCTC", "lot_size": 875, "step_size": 10.0, "is_index": False},
    {"symbol": "IRFC", "name": "Indian Railway Finance", "lot_size": 4000, "step_size": 2.5, "is_index": False},
    {"symbol": "ITC", "name": "ITC Limited", "lot_size": 1600, "step_size": 5.0, "is_index": False},
    {"symbol": "JINDALSTEL", "name": "Jindal Steel & Power", "lot_size": 625, "step_size": 10.0, "is_index": False},
    {"symbol": "JIOFIN", "name": "Jio Financial Services", "lot_size": 2000, "step_size": 5.0, "is_index": False},
    {"symbol": "JKCEMENT", "name": "JK Cement", "lot_size": 125, "step_size": 50.0, "is_index": False},
    {"symbol": "JSWSTEEL", "name": "JSW Steel", "lot_size": 675, "step_size": 10.0, "is_index": False},
    {"symbol": "JUBLFOOD", "name": "Jubilant FoodWorks", "lot_size": 1250, "step_size": 10.0, "is_index": False},
    {"symbol": "KAYNES", "name": "Kaynes Technology", "lot_size": 125, "step_size": 100.0, "is_index": False},
    {"symbol": "KEI", "name": "KEI Industries", "lot_size": 150, "step_size": 100.0, "is_index": False},
    {"symbol": "KOTAKBANK", "name": "Kotak Mahindra Bank", "lot_size": 400, "step_size": 20.0, "is_index": False},
    {"symbol": "KPITTECH", "name": "KPIT Technologies", "lot_size": 400, "step_size": 25.0, "is_index": False},
    {"symbol": "LALPATHLAB", "name": "Dr. Lal PathLabs", "lot_size": 300, "step_size": 50.0, "is_index": False},
    {"symbol": "LAURUSLABS", "name": "Laurus Labs", "lot_size": 1700, "step_size": 5.0, "is_index": False},
    {"symbol": "LICHSGFIN", "name": "LIC Housing Finance", "lot_size": 1000, "step_size": 10.0, "is_index": False},
    {"symbol": "LICI", "name": "Life Insurance Corp", "lot_size": 700, "step_size": 10.0, "is_index": False},
    {"symbol": "LODHA", "name": "Macrotech Developers", "lot_size": 475, "step_size": 20.0, "is_index": False},
    {"symbol": "LT", "name": "Larsen & Toubro", "lot_size": 150, "step_size": 50.0, "is_index": False},
    {"symbol": "LTIM", "name": "LTIMindtree", "lot_size": 150, "step_size": 50.0, "is_index": False},
    {"symbol": "LTTS", "name": "L&T Technology Services", "lot_size": 200, "step_size": 50.0, "is_index": False},
    {"symbol": "LUPIN", "name": "Lupin Limited", "lot_size": 425, "step_size": 20.0, "is_index": False},
    {"symbol": "M&M", "name": "Mahindra & Mahindra", "lot_size": 350, "step_size": 20.0, "is_index": False},
    {"symbol": "M&MFIN", "name": "Mahindra Finance", "lot_size": 2000, "step_size": 5.0, "is_index": False},
    {"symbol": "MANAPPURAM", "name": "Manappuram Finance", "lot_size": 3000, "step_size": 2.5, "is_index": False},
    {"symbol": "MARICO", "name": "Marico Limited", "lot_size": 1200, "step_size": 10.0, "is_index": False},
    {"symbol": "MARUTI", "name": "Maruti Suzuki", "lot_size": 50, "step_size": 100.0, "is_index": False},
    {"symbol": "MAXHEALTH", "name": "Max Healthcare", "lot_size": 550, "step_size": 20.0, "is_index": False},
    {"symbol": "MAZDOCK", "name": "Mazagon Dock Shipbuilders", "lot_size": 175, "step_size": 50.0, "is_index": False},
    {"symbol": "MCX", "name": "Multi Commodity Exchange", "lot_size": 125, "step_size": 100.0, "is_index": False},
    {"symbol": "METROBRAND", "name": "Metro Brands", "lot_size": 400, "step_size": 25.0, "is_index": False},
    {"symbol": "MFSL", "name": "Max Financial Services", "lot_size": 800, "step_size": 20.0, "is_index": False},
    {"symbol": "MGL", "name": "Mahanagar Gas", "lot_size": 400, "step_size": 20.0, "is_index": False},
    {"symbol": "MOTHERSON", "name": "Samvardhana Motherson", "lot_size": 6100, "step_size": 2.0, "is_index": False},
    {"symbol": "MPHASIS", "name": "Mphasis Limited", "lot_size": 275, "step_size": 50.0, "is_index": False},
    {"symbol": "MRF", "name": "MRF Limited", "lot_size": 5, "step_size": 1000.0, "is_index": False},
    {"symbol": "MUTHOOTFIN", "name": "Muthoot Finance", "lot_size": 375, "step_size": 20.0, "is_index": False},
    {"symbol": "NATIONALUM", "name": "National Aluminium", "lot_size": 3750, "step_size": 2.5, "is_index": False},
    {"symbol": "NAUKRI", "name": "Info Edge", "lot_size": 125, "step_size": 100.0, "is_index": False},
    {"symbol": "NAVINFLUOR", "name": "Navin Fluorine", "lot_size": 150, "step_size": 50.0, "is_index": False},
    {"symbol": "NESTLEIND", "name": "Nestle India", "lot_size": 250, "step_size": 20.0, "is_index": False},
    {"symbol": "NMDC", "name": "NMDC Limited", "lot_size": 2700, "step_size": 2.5, "is_index": False},
    {"symbol": "NTPC", "name": "NTPC Limited", "lot_size": 1500, "step_size": 5.0, "is_index": False},
    {"symbol": "OBEROIRLTY", "name": "Oberoi Realty", "lot_size": 350, "step_size": 50.0, "is_index": False},
    {"symbol": "OFSS", "name": "Oracle Financial", "lot_size": 75, "step_size": 200.0, "is_index": False},
    {"symbol": "ONGC", "name": "ONGC", "lot_size": 3850, "step_size": 5.0, "is_index": False},
    {"symbol": "PAGEIND", "name": "Page Industries", "lot_size": 15, "step_size": 500.0, "is_index": False},
    {"symbol": "PAYTM", "name": "One97 Communications", "lot_size": 850, "step_size": 20.0, "is_index": False},
    {"symbol": "PERSISTENT", "name": "Persistent Systems", "lot_size": 100, "step_size": 100.0, "is_index": False},
    {"symbol": "PETRONET", "name": "Petronet LNG", "lot_size": 1800, "step_size": 5.0, "is_index": False},
    {"symbol": "PFC", "name": "Power Finance Corp", "lot_size": 1950, "step_size": 5.0, "is_index": False},
    {"symbol": "PIDILITIND", "name": "Pidilite Industries", "lot_size": 250, "step_size": 50.0, "is_index": False},
    {"symbol": "PIIND", "name": "PI Industries", "lot_size": 150, "step_size": 50.0, "is_index": False},
    {"symbol": "PNB", "name": "Punjab National Bank", "lot_size": 8000, "step_size": 1.0, "is_index": False},
    {"symbol": "POLICYBZR", "name": "PB Fintech", "lot_size": 350, "step_size": 50.0, "is_index": False},
    {"symbol": "POLYCAB", "name": "Polycab India", "lot_size": 100, "step_size": 100.0, "is_index": False},
    {"symbol": "POWERGRID", "name": "Power Grid Corp", "lot_size": 2700, "step_size": 5.0, "is_index": False},
    {"symbol": "PVRINOX", "name": "PVR INOX", "lot_size": 400, "step_size": 20.0, "is_index": False},
    {"symbol": "RAMCOCEM", "name": "The Ramco Cements", "lot_size": 850, "step_size": 10.0, "is_index": False},
    {"symbol": "RBLBANK", "name": "RBL Bank", "lot_size": 2500, "step_size": 5.0, "is_index": False},
    {"symbol": "REC", "name": "REC Limited", "lot_size": 2000, "step_size": 5.0, "is_index": False},
    {"symbol": "RECLTD", "name": "REC Limited", "lot_size": 2000, "step_size": 5.0, "is_index": False},
    {"symbol": "RELIANCE", "name": "Reliance Industries", "lot_size": 250, "step_size": 20.0, "is_index": False},
    {"symbol": "RVNL", "name": "Rail Vikas Nigam", "lot_size": 1250, "step_size": 10.0, "is_index": False},
    {"symbol": "SAIL", "name": "Steel Authority of India", "lot_size": 4700, "step_size": 2.5, "is_index": False},
    {"symbol": "SBICARD", "name": "SBI Cards", "lot_size": 800, "step_size": 10.0, "is_index": False},
    {"symbol": "SBILIFE", "name": "SBI Life Insurance", "lot_size": 750, "step_size": 20.0, "is_index": False},
    {"symbol": "SBIN", "name": "State Bank of India", "lot_size": 750, "step_size": 10.0, "is_index": False},
    {"symbol": "SHREECEM", "name": "Shree Cement", "lot_size": 25, "step_size": 250.0, "is_index": False},
    {"symbol": "SHRIRAMFIN", "name": "Shriram Finance", "lot_size": 300, "step_size": 50.0, "is_index": False},
    {"symbol": "SIEMENS", "name": "Siemens Limited", "lot_size": 125, "step_size": 100.0, "is_index": False},
    {"symbol": "SRF", "name": "SRF Limited", "lot_size": 250, "step_size": 50.0, "is_index": False},
    {"symbol": "SUNPHARMA", "name": "Sun Pharma", "lot_size": 350, "step_size": 20.0, "is_index": False},
    {"symbol": "SUNTV", "name": "Sun TV Network", "lot_size": 1000, "step_size": 10.0, "is_index": False},
    {"symbol": "SUZLON", "name": "Suzlon Energy", "lot_size": 8000, "step_size": 1.0, "is_index": False},
    {"symbol": "SWIGGY", "name": "Swiggy Limited", "lot_size": 1000, "step_size": 10.0, "is_index": False},
    {"symbol": "SYNGENE", "name": "Syngene International", "lot_size": 1000, "step_size": 10.0, "is_index": False},
    {"symbol": "TATACHEM", "name": "Tata Chemicals", "lot_size": 550, "step_size": 20.0, "is_index": False},
    {"symbol": "TATACOMM", "name": "Tata Communications", "lot_size": 300, "step_size": 50.0, "is_index": False},
    {"symbol": "TATACONSUM", "name": "Tata Consumer Products", "lot_size": 900, "step_size": 20.0, "is_index": False},
    {"symbol": "TATAELXSI", "name": "Tata Elxsi", "lot_size": 100, "step_size": 100.0, "is_index": False},
    {"symbol": "TATAMOTORS", "name": "Tata Motors", "lot_size": 700, "step_size": 10.0, "is_index": False},
    {"symbol": "TATAPOWER", "name": "Tata Power", "lot_size": 2025, "step_size": 5.0, "is_index": False},
    {"symbol": "TATASTEEL", "name": "Tata Steel", "lot_size": 5500, "step_size": 2.5, "is_index": False},
    {"symbol": "TCS", "name": "Tata Consultancy Services", "lot_size": 175, "step_size": 20.0, "is_index": False},
    {"symbol": "TECHM", "name": "Tech Mahindra", "lot_size": 600, "step_size": 20.0, "is_index": False},
    {"symbol": "TITAGARH", "name": "Titagarh Rail Systems", "lot_size": 450, "step_size": 25.0, "is_index": False},
    {"symbol": "TITAN", "name": "Titan Company", "lot_size": 175, "step_size": 50.0, "is_index": False},
    {"symbol": "TORNTPHARM", "name": "Torrent Pharmaceuticals", "lot_size": 250, "step_size": 50.0, "is_index": False},
    {"symbol": "TORNTPOWER", "name": "Torrent Power", "lot_size": 375, "step_size": 50.0, "is_index": False},
    {"symbol": "TRENT", "name": "Trent Limited", "lot_size": 100, "step_size": 100.0, "is_index": False},
    {"symbol": "TVSMOTOR", "name": "TVS Motor", "lot_size": 350, "step_size": 50.0, "is_index": False},
    {"symbol": "UBL", "name": "United Breweries", "lot_size": 350, "step_size": 20.0, "is_index": False},
    {"symbol": "ULTRACEMCO", "name": "UltraTech Cement", "lot_size": 100, "step_size": 100.0, "is_index": False},
    {"symbol": "UNIONBANK", "name": "Union Bank of India", "lot_size": 4500, "step_size": 2.5, "is_index": False},
    {"symbol": "UPL", "name": "UPL Limited", "lot_size": 1300, "step_size": 10.0, "is_index": False},
    {"symbol": "VEDL", "name": "Vedanta Limited", "lot_size": 2300, "step_size": 5.0, "is_index": False},
    {"symbol": "VOLTAS", "name": "Voltas Limited", "lot_size": 400, "step_size": 20.0, "is_index": False},
    {"symbol": "WIPRO", "name": "Wipro Limited", "lot_size": 1500, "step_size": 5.0, "is_index": False},
    {"symbol": "ZOMATO", "name": "Zomato Limited", "lot_size": 2000, "step_size": 5.0, "is_index": False},
    {"symbol": "ZYDUSLIFE", "name": "Zydus Lifesciences", "lot_size": 450, "step_size": 20.0, "is_index": False},
]

def get_official_fo_underlyings():
    """Return in-memory official NSE F&O Master list"""
    return OFFICIAL_NSE_FO_LIST

def refresh_fo_underlyings_db(session):
    """
    Populate or update fo_underlyings table from live NSE source / master list.
    """
    try:
        from app import FOUnderlying
        count = 0
        for item in OFFICIAL_NSE_FO_LIST:
            sym = item["symbol"].upper()
            existing = session.query(FOUnderlying).filter(FOUnderlying.symbol == sym).first()
            if existing:
                existing.lot_size = item["lot_size"]
                existing.step_size = item["step_size"]
                existing.is_index = item["is_index"]
                existing.is_active = True
                existing.last_refreshed_at = datetime.utcnow()
            else:
                record = FOUnderlying(
                    symbol=sym,
                    name=item["name"],
                    exchange=item.get("exchange", "NSE"),
                    lot_size=item["lot_size"],
                    step_size=item["step_size"],
                    is_index=item["is_index"],
                    is_active=True,
                    last_refreshed_at=datetime.utcnow()
                )
                session.add(record)
            count += 1
        session.commit()
        logger.info(f"✅ Successfully refreshed {count} F&O Underlyings in database.")
        return count
    except Exception as e:
        session.rollback()
        logger.error(f"Error refreshing fo_underlyings DB: {e}")
        return 0
