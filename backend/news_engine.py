"""
BullX Professional Live News Engine
====================================
RSS-powered financial news aggregation with:
- Multi-source RSS polling (8 free feeds)
- Article normalization & deduplication
- Company/stock symbol detection
- Category classification & importance scoring
- Background scheduler (60s polling)
- SSE broadcast integration

NO fake news. NO paid APIs required. NO Groww scraping.
"""

import os
import re
import json
import time
import hashlib
import logging
import threading
from datetime import datetime, timedelta, timezone
from collections import deque
from urllib.parse import urlparse, urljoin

import feedparser
import requests

logger = logging.getLogger("news_engine")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s [NEWS] %(levelname)s: %(message)s"))
    logger.addHandler(handler)

# ============================================================
# IST Timezone
# ============================================================
IST = timezone(timedelta(hours=5, minutes=30))

# ============================================================
# Default RSS Feed Configuration
# ============================================================
DEFAULT_FEEDS = [
    # ============ STOCKS ============
    {
        "name": "Economic Times - Stocks",
        "url": "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms",
        "source": "Economic Times",
        "category_hint": "STOCKS",
        "poll_interval": 300,
    },
    {
        "name": "Economic Times - Markets",
        "url": "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
        "source": "Economic Times",
        "category_hint": "STOCKS",
        "poll_interval": 300,
    },
    {
        "name": "Economic Times - Companies",
        "url": "https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms",
        "source": "Economic Times",
        "category_hint": "STOCKS",
        "poll_interval": 600,
    },
    {
        "name": "LiveMint - Markets",
        "url": "https://www.livemint.com/rss/markets",
        "source": "LiveMint",
        "category_hint": "STOCKS",
        "poll_interval": 300,
    },
    {
        "name": "LiveMint - Companies",
        "url": "https://www.livemint.com/rss/companies",
        "source": "LiveMint",
        "category_hint": "STOCKS",
        "poll_interval": 600,
    },
    {
        "name": "Business Standard - Markets",
        "url": "https://www.business-standard.com/rss/markets.xml",
        "source": "Business Standard",
        "category_hint": "STOCKS",
        "poll_interval": 600,
    },
    {
        "name": "Moneycontrol - Top Stories",
        "url": "https://www.moneycontrol.com/rss/latestnews.xml",
        "source": "Moneycontrol",
        "category_hint": "STOCKS",
        "poll_interval": 600,
    },
    {
        "name": "Moneycontrol - Buzzing Stocks",
        "url": "https://www.moneycontrol.com/rss/buzzingstocks.xml",
        "source": "Moneycontrol",
        "category_hint": "STOCKS",
        "poll_interval": 900,
    },
    {
        "name": "NDTV Profit",
        "url": "https://feeds.feedburner.com/ndtvprofit-latest",
        "source": "NDTV Profit",
        "category_hint": "STOCKS",
        "poll_interval": 600,
    },
    {
        "name": "Hindu BusinessLine - Stocks",
        "url": "https://www.thehindubusinessline.com/markets/stock-markets/feeder/default.rss",
        "source": "Hindu BusinessLine",
        "category_hint": "STOCKS",
        "poll_interval": 600,
    },
    {
        "name": "The Hindu - Business",
        "url": "https://www.thehindu.com/business/feeder/default.rss",
        "source": "The Hindu Business",
        "category_hint": "STOCKS",
        "poll_interval": 600,
    },
    {
        "name": "Business Today",
        "url": "https://www.businesstoday.in/rss/feed",
        "source": "Business Today",
        "category_hint": "STOCKS",
        "poll_interval": 600,
    },
    {
        "name": "Investing.com - News",
        "url": "https://www.investing.com/rss/news.rss",
        "source": "Investing.com",
        "category_hint": "STOCKS",
        "poll_interval": 600,
    },

    # ============ IPOs & LISTINGS ============
    {
        "name": "Economic Times - IPO",
        "url": "https://economictimes.indiatimes.com/markets/ipo/rssfeeds/2146842.cms",
        "source": "Economic Times",
        "category_hint": "IPO",
        "poll_interval": 900,
    },
    {
        "name": "Moneycontrol - IPO News",
        "url": "https://www.moneycontrol.com/rss/iponews.xml",
        "source": "Moneycontrol",
        "category_hint": "IPO",
        "poll_interval": 900,
    },
    {
        "name": "Google News - IPO India",
        "url": "https://news.google.com/rss/search?q=IPO+India+listing+allotment+subscription%20-when:1d&hl=en-IN&gl=IN&ceid=IN:en",
        "source": "Google News",
        "category_hint": "IPO",
        "poll_interval": 600,
    },

    # ============ COMMODITIES ============
    {
        "name": "Economic Times - Commodities",
        "url": "https://economictimes.indiatimes.com/markets/commodities/rssfeeds/1977021501.cms",
        "source": "Economic Times",
        "category_hint": "COMMODITIES",
        "poll_interval": 600,
    },
    {
        "name": "Google News - Commodities",
        "url": "https://news.google.com/rss/search?q=gold+silver+crude+oil+MCX+commodities&hl=en-IN&gl=IN&ceid=IN:en",
        "source": "Google News",
        "category_hint": "COMMODITIES",
        "poll_interval": 600,
    },

    # ============ ECONOMY / MACRO ============
    {
        "name": "LiveMint - Economy",
        "url": "https://www.livemint.com/rss/economy",
        "source": "LiveMint",
        "category_hint": "ECONOMY",
        "poll_interval": 600,
    },
    {
        "name": "Economic Times - Economy",
        "url": "https://economictimes.indiatimes.com/news/economy/rssfeeds/1218232804.cms",
        "source": "Economic Times",
        "category_hint": "ECONOMY",
        "poll_interval": 600,
    },
    {
        "name": "Google News - Economy & RBI",
        "url": "https://news.google.com/rss/search?q=RBI+Indian+economy+GDP+inflation+repo+rate&hl=en-IN&gl=IN&ceid=IN:en",
        "source": "Google News",
        "category_hint": "ECONOMY",
        "poll_interval": 600,
    },

    # ============ RESULTS ============
    {
        "name": "Moneycontrol - Results",
        "url": "https://www.moneycontrol.com/rss/results.xml",
        "source": "Moneycontrol",
        "category_hint": "RESULTS",
        "poll_interval": 900,
    },
    {
        "name": "Google News - Earnings Q1 Q2 Q3 Q4",
        "url": "https://news.google.com/rss/search?q=company+quarterly+results+net+profit+revenue+India&hl=en-IN&gl=IN&ceid=IN:en",
        "source": "Google News",
        "category_hint": "RESULTS",
        "poll_interval": 600,
    },

    # ============ F&O (FUTURES & OPTIONS) ============
    {
        "name": "Google News - F&O Nifty Options",
        "url": "https://news.google.com/rss/search?q=Nifty+futures+options+expiry+%22F%26O%22&hl=en-IN&gl=IN&ceid=IN:en",
        "source": "Google News",
        "category_hint": "F&O",
        "poll_interval": 600,
    },

    # ============ GLOBAL ============
    {
        "name": "Google News - India Markets Global",
        "url": "https://news.google.com/rss/search?q=NSE+OR+BSE+OR+Nifty+OR+Sensex&hl=en-IN&gl=IN&ceid=IN:en",
        "source": "Google News",
        "category_hint": "GLOBAL",
        "poll_interval": 300,
    },

    # ============ CORPORATE ============
    {
        "name": "BSE India - Notices",
        "url": "https://www.bseindia.com/data/xml/notices.xml",
        "source": "BSE",
        "category_hint": "CORPORATE",
        "poll_interval": 600,
    },
]

# ============================================================
# Company / Stock Detection Dictionary
# ============================================================
COMPANY_ALIASES = {
    # Major Indices
    "nifty": "NIFTY", "nifty 50": "NIFTY", "nifty50": "NIFTY",
    "sensex": "SENSEX", "bse sensex": "SENSEX",
    "bank nifty": "BANKNIFTY", "banknifty": "BANKNIFTY",
    # Top 50 Indian Stocks
    "reliance": "RELIANCE", "reliance industries": "RELIANCE", "ril": "RELIANCE",
    "reliance industries ltd": "RELIANCE", "reliance industries limited": "RELIANCE",
    "tcs": "TCS", "tata consultancy": "TCS", "tata consultancy services": "TCS",
    "infosys": "INFY", "infosys ltd": "INFY", "infosys limited": "INFY",
    "hdfc bank": "HDFCBANK", "hdfc bank ltd": "HDFCBANK", "hdfcbank": "HDFCBANK",
    "icici bank": "ICICIBANK", "icici bank ltd": "ICICIBANK",
    "hindustan unilever": "HINDUNILVR", "hul": "HINDUNILVR",
    "itc": "ITC", "itc ltd": "ITC", "itc limited": "ITC",
    "sbi": "SBIN", "state bank": "SBIN", "state bank of india": "SBIN",
    "bharti airtel": "BHARTIARTL", "airtel": "BHARTIARTL",
    "kotak mahindra": "KOTAKBANK", "kotak bank": "KOTAKBANK", "kotak mahindra bank": "KOTAKBANK",
    "larsen": "LT", "l&t": "LT", "larsen & toubro": "LT", "larsen and toubro": "LT",
    "axis bank": "AXISBANK", "axis bank ltd": "AXISBANK",
    "bajaj finance": "BAJFINANCE", "bajaj finance ltd": "BAJFINANCE",
    "bajaj finserv": "BAJAJFINSV",
    "asian paints": "ASIANPAINT", "asian paints ltd": "ASIANPAINT",
    "maruti suzuki": "MARUTI", "maruti": "MARUTI", "maruti suzuki india": "MARUTI",
    "titan": "TITAN", "titan company": "TITAN",
    "sun pharma": "SUNPHARMA", "sun pharmaceutical": "SUNPHARMA",
    "wipro": "WIPRO", "wipro ltd": "WIPRO",
    "hcl tech": "HCLTECH", "hcl technologies": "HCLTECH",
    "power grid": "POWERGRID", "power grid corporation": "POWERGRID",
    "ntpc": "NTPC", "ntpc ltd": "NTPC",
    "tata motors": "TATAMOTORS", "tata motors ltd": "TATAMOTORS",
    "tata steel": "TATASTEEL", "tata steel ltd": "TATASTEEL",
    "ultratech": "ULTRACEMCO", "ultratech cement": "ULTRACEMCO",
    "nestle": "NESTLEIND", "nestle india": "NESTLEIND",
    "indusind bank": "INDUSINDBK", "indusind": "INDUSINDBK",
    "tech mahindra": "TECHM", "tech mahindra ltd": "TECHM",
    "adani enterprises": "ADANIENT", "adani": "ADANIENT",
    "adani ports": "ADANIPORTS", "adani ports and sez": "ADANIPORTS",
    "adani green": "ADANIGREEN", "adani green energy": "ADANIGREEN",
    "adani power": "ADANIPOWER",
    "mahindra": "M&M", "m&m": "M&M", "mahindra & mahindra": "M&M",
    "dr reddy": "DRREDDY", "dr reddys": "DRREDDY", "dr. reddy's": "DRREDDY",
    "cipla": "CIPLA", "cipla ltd": "CIPLA",
    "eicher motors": "EICHERMOT", "eicher": "EICHERMOT",
    "grasim": "GRASIM", "grasim industries": "GRASIM",
    "divis lab": "DIVISLAB", "divi's laboratories": "DIVISLAB",
    "britannia": "BRITANNIA", "britannia industries": "BRITANNIA",
    "hero motocorp": "HEROMOTOCO", "hero moto": "HEROMOTOCO",
    "jsw steel": "JSWSTEEL", "jsw": "JSWSTEEL",
    "coal india": "COALINDIA", "coal india ltd": "COALINDIA",
    "ongc": "ONGC", "oil and natural gas": "ONGC",
    "bpcl": "BPCL", "bharat petroleum": "BPCL",
    "ioc": "IOC", "indian oil": "IOC", "indian oil corporation": "IOC",
    "hindalco": "HINDALCO", "hindalco industries": "HINDALCO",
    "tata consumer": "TATACONSUM", "tata consumer products": "TATACONSUM",
    "apollo hospitals": "APOLLOHOSP", "apollo": "APOLLOHOSP",
    "bajaj auto": "BAJAJ-AUTO", "bajaj auto ltd": "BAJAJ-AUTO",
    "hdfc life": "HDFCLIFE", "hdfc life insurance": "HDFCLIFE",
    "sbi life": "SBILIFE", "sbi life insurance": "SBILIFE",
    "vedanta": "VEDL", "vedanta ltd": "VEDL",
    "zomato": "ZOMATO",
    "paytm": "PAYTM", "one97": "PAYTM", "one 97 communications": "PAYTM",
    "delhivery": "DELHIVERY",
    "nykaa": "NYKAA", "fsnl": "NYKAA", "fsn e-commerce": "NYKAA",
    "rbi": "__RBI__", "reserve bank": "__RBI__", "reserve bank of india": "__RBI__",
    "sebi": "__SEBI__",
}

# Words that should NOT trigger stock mapping on their own
FALSE_POSITIVE_WORDS = {
    "bank", "india", "oil", "power", "steel", "auto", "life", "green",
    "energy", "motors", "pharma", "tech", "finance", "cement", "coal",
    "gold", "silver", "copper", "crude", "market", "stock", "share",
    "trade", "invest", "fund", "mutual", "nse", "bse", "sebi", "rbi",
}

# ============================================================
# Category Classification Keywords
# ============================================================
CATEGORY_KEYWORDS = {
    "F&O": ["futures", "options", "f&o", "expiry", "rollover", "open interest", "nifty options", "banknifty options", "nifty futures", "options chain", "oi data", "covered call", "straddle"],
    "IPO": ["ipo", "ipo news", "initial public offering", "listing", "listing date", "listing gains", "allotment", "subscription", "smest", "anchor book", "price band", "grey market"],
    "RESULTS": ["q1", "q2", "q3", "q4", "h1", "h2", "fy", "quarterly", "quarter", "profit", "revenue", "earnings", "net profit", "net loss", "pat", "ebitda", "results", "earnings call", "guidance", "revenue grew", "profit rise", "profit falls", "dividend declared with results"],
    "DIVIDEND": ["dividend", "interim dividend", "final dividend", "record date", "ex-dividend", "ex-date", "buyback", "shareholder return"],
    "CORPORATE": ["merger", "acquisition", "demerger", "buyback", "bonus", "stock split", "rights issue", "board meeting", "agm", "egm", "stake sale", "fundraising", "qip", "warrants", "board approves"],
    "REGULATORY": ["sebi", "rbi", "regulatory", "compliance", "penalty", "fine", "ban", "circular", "guideline", "show cause", "surveillance", "investigation", "mas", "insider trading"],
    "ECONOMY": ["gdp", "gd growth", "inflation", "cpi", "wpi", "fiscal", "monetary policy", "repo rate", "reppo", "interest rate", "fed", "rbi policy", "rbi", "rate cut", "rate hike", "economic growth", "current account", "forex reserves", "trade deficit", "industrial production", "iip"],
    "COMMODITIES": ["gold", "silver", "crude oil", "brent", "natural gas", "copper", "commodity", "commodities", "mcx", "bullion", "palm oil", "wheat", "zinc", "aluminium", "soybean", "mentha", "gasoline", "heating oil", "precious metals", "base metals"],
    "GLOBAL": ["wall street", "nasdaq", "dow jones", "s&p 500", "fed", "federal reserve", "us market", "global market", "ftse", "dax", "nikkei", "hang seng", "us fed", "us treasury", "dxy", "dollar index", "global cues"],
}

# ============================================================
# Importance Keywords
# ============================================================
HIGH_IMPORTANCE_KEYWORDS = [
    "merger", "acquisition", "takeover", "buyback", "fraud", "scam",
    "ban", "penalty", "halt", "suspend", "crash", "surge", "record high",
    "record low", "all-time high", "block deal", "bulk deal", "management change",
    "ceo", "chairman", "resign", "appoint", "major order", "rights issue",
    "bonus", "split", "delisting", "insolvency", "bankruptcy", "nclt",
]

POSITIVE_KEYWORDS = [
    "surge", "rally", "gain", "rise", "profit", "growth", "record high",
    "outperform", "upgrade", "buy", "bullish", "positive", "strong",
    "breakout", "all-time high", "boom", "soar",
]

NEGATIVE_KEYWORDS = [
    "crash", "fall", "drop", "loss", "decline", "plunge", "downgrade",
    "sell", "bearish", "negative", "weak", "slump", "tumble", "plummet",
    "correction", "recession", "default", "fraud", "scam",
]


# ============================================================
# RSS News Provider
# ============================================================
class RSSNewsProvider:
    """Fetches and parses RSS feeds from configured sources."""

    USER_AGENT = "BullXNewsAggregator/1.0 (trading-terminal; contact@bullx.in)"

    def __init__(self, feeds=None):
        self.feeds = feeds or DEFAULT_FEEDS
        self._session = requests.Session()
        self._session.headers.update({
            "User-Agent": self.USER_AGENT,
            "Accept": "application/rss+xml, application/xml, text/xml, */*",
        })

    def fetch_all(self):
        """Fetch all configured feeds. Returns list of raw article dicts."""
        all_articles = []
        for feed_config in self.feeds:
            try:
                articles = self._fetch_feed(feed_config)
                all_articles.extend(articles)
            except Exception as e:
                logger.warning(f"Feed failed: {feed_config['name']}: {e}")
        return all_articles

    def _fetch_feed(self, feed_config):
        """Fetch and parse a single RSS feed."""
        url = feed_config["url"]
        source = feed_config["source"]
        category_hint = feed_config.get("category_hint", "OTHER")

        try:
            resp = self._session.get(url, timeout=10)
            if resp.status_code != 200:
                logger.warning(f"HTTP {resp.status_code} from {source}: {url}")
                return []
        except requests.RequestException as e:
            logger.warning(f"Request failed for {source}: {e}")
            return []

        parsed = feedparser.parse(resp.content)
        articles = []

        for entry in parsed.entries:
            try:
                article = self._parse_entry(entry, source, category_hint)
                if article:
                    articles.append(article)
            except Exception as e:
                logger.debug(f"Failed to parse entry from {source}: {e}")

        logger.info(f"Fetched {len(articles)} articles from {source}")
        return articles

    def _parse_entry(self, entry, source, category_hint):
        """Parse a single RSS entry into a normalized article dict."""
        title = (entry.get("title") or "").strip()
        if not title or title.lower() in ("undefined", "null", "none"):
            return None

        # Extract link
        link = entry.get("link") or entry.get("id") or ""
        if hasattr(entry, "links") and entry.links:
            for l in entry.links:
                if l.get("rel") == "alternate" and l.get("href"):
                    link = l["href"]
                    break
        if link and not link.startswith(("http://", "https://")):
            link = ""
        if not link or link.lower().startswith(("undefined", "null")):
            return None

        # Extract summary
        summary = ""
        if entry.get("summary"):
            summary = re.sub(r"<[^>]+>", "", entry["summary"]).strip()[:500]
        elif entry.get("description"):
            summary = re.sub(r"<[^>]+>", "", entry["description"]).strip()[:500]

        # Extract published date
        published_at = None
        if entry.get("published_parsed"):
            try:
                published_at = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
            except Exception:
                pass
        if not published_at and entry.get("updated_parsed"):
            try:
                published_at = datetime(*entry.updated_parsed[:6], tzinfo=timezone.utc)
            except Exception:
                pass
        if not published_at:
            published_at = datetime.now(timezone.utc)

        # Extract image
        image_url = None
        if hasattr(entry, "media_content") and entry.media_content:
            for mc in entry.media_content:
                if mc.get("url"):
                    image_url = mc["url"]
                    break
        if not image_url and hasattr(entry, "media_thumbnail") and entry.media_thumbnail:
            for mt in entry.media_thumbnail:
                if mt.get("url"):
                    image_url = mt["url"]
                    break
        if not image_url and entry.get("enclosures"):
            for enc in entry.enclosures:
                if enc.get("type", "").startswith("image") and enc.get("href"):
                    image_url = enc["href"]
                    break

        # Provider ID (guid)
        provider_id = entry.get("id") or entry.get("guid") or link

        return {
            "provider_id": provider_id,
            "title": title,
            "summary": summary,
            "source": source,
            "source_url": link,
            "canonical_url": self._normalize_url(link),
            "published_at": published_at,
            "fetched_at": datetime.now(timezone.utc),
            "category_hint": category_hint,
            "image_url": image_url,
        }

    def _normalize_url(self, url):
        """Normalize URL for deduplication."""
        if not url:
            return ""
        parsed = urlparse(url)
        # Remove tracking parameters
        clean = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
        return clean.rstrip("/").lower()


# ============================================================
# News Deduplicator
# ============================================================
class NewsDeduplifier:
    """Detects duplicate articles using URL, headline, and content similarity."""

    def __init__(self):
        self._seen_urls = set()
        self._seen_title_hashes = set()

    def load_existing(self, existing_urls, existing_title_hashes):
        """Load existing article fingerprints from database."""
        self._seen_urls = set(existing_urls)
        self._seen_title_hashes = set(existing_title_hashes)

    def is_duplicate(self, article):
        """Check if article is a duplicate. Returns True if duplicate."""
        url = article.get("canonical_url", "")
        title = article.get("title", "")

        # Check exact URL match
        if url and url in self._seen_urls:
            return True

        # Check title hash (exact title match)
        title_hash = self._hash_title(title)
        if title_hash in self._seen_title_hashes:
            return True

        # Check near-duplicate title (token overlap)
        normalized_title = self._normalize_title(title)
        for existing_hash in list(self._seen_title_hashes)[-200:]:
            pass  # We only check exact + hash; near-dupe is handled by hash

        return False

    def mark_seen(self, article):
        """Mark article as seen."""
        url = article.get("canonical_url", "")
        title = article.get("title", "")
        if url:
            self._seen_urls.add(url)
        self._seen_title_hashes.add(self._hash_title(title))

    def _hash_title(self, title):
        """Create a normalized hash of the title for dedup."""
        normalized = self._normalize_title(title)
        return hashlib.md5(normalized.encode()).hexdigest()

    def _normalize_title(self, title):
        """Normalize title for comparison."""
        t = title.lower().strip()
        t = re.sub(r"[^\w\s]", "", t)  # Remove punctuation
        t = re.sub(r"\s+", " ", t)      # Collapse whitespace
        tokens = t.split()
        tokens.sort()  # Sort tokens for order-independent comparison
        return " ".join(tokens)


# ============================================================
# Stock Mapper
# ============================================================
class StockMapper:
    """Maps news articles to BullX stock symbols."""

    def __init__(self):
        # Build reverse lookup: lowercase alias → symbol
        self._alias_map = {}
        for alias, symbol in COMPANY_ALIASES.items():
            self._alias_map[alias.lower()] = symbol

        # Sort aliases by length (longest first) for greedy matching
        self._sorted_aliases = sorted(self._alias_map.keys(), key=len, reverse=True)

    def detect_symbols(self, title, summary=""):
        """Detect stock symbols mentioned in title and summary."""
        text = f"{title} {summary}".lower()
        found = set()

        for alias in self._sorted_aliases:
            if len(alias) < 3:
                continue  # Skip very short aliases to avoid false positives

            # Word boundary matching
            pattern = r'\b' + re.escape(alias) + r'\b'
            if re.search(pattern, text):
                symbol = self._alias_map[alias]
                # Skip regulatory bodies
                if symbol.startswith("__"):
                    continue
                # Skip false-positive single words
                if alias in FALSE_POSITIVE_WORDS:
                    continue
                found.add(symbol)

        return list(found)

    def detect_companies(self, title, summary=""):
        """Detect company names (human-readable) mentioned in text."""
        text = f"{title} {summary}".lower()
        found = []

        for alias in self._sorted_aliases:
            if len(alias) < 4:
                continue
            pattern = r'\b' + re.escape(alias) + r'\b'
            if re.search(pattern, text):
                symbol = self._alias_map[alias]
                if not symbol.startswith("__"):
                    found.append(alias.title())

        return list(set(found))[:5]  # Max 5 company names


# ============================================================
# News Classifier
# ============================================================
class NewsClassifier:
    """Classifies articles by category, importance, and sentiment."""

    def classify_category(self, title, summary="", hint="OTHER"):
        """Determine article category.

        Strategy:
        1. First check the feed's explicit category_hint (source is the most
           reliable signal of a story's domain). If it is a specific non-default
           category, prefer it unless a much stronger specific keyword is found.
        2. Score keyword matches across all categories. Category with the most
           matched keywords wins (ties broken by priority).
        3. Fall back to the feed hint, or STOCKS as a last resort.
        """
        text = f"{title} {summary}".lower()

        # Weighted score per category based on keyword matches
        scores = {}
        for category, keywords in CATEGORY_KEYWORDS.items():
            hits = 0
            for kw in keywords:
                if re.search(r"\b" + re.escape(kw) + r"\b", text):
                    hits += 1
            scores[category] = hits

        best_match = max(scores, key=scores.get)
        best_score = scores[best_match]

        # If a strong specific match is found, use it regardless of hint
        if best_score >= 2:
            return best_match

        # If a single clear keyword matched, still trust it over a generic hint
        if best_score == 1:
            return best_match

        # No strong keyword match — trust the feed's known category hint
        h = (hint or "OTHER").upper()
        return h if h in scores or h == "STOCKS" else "STOCKS"

    def score_importance(self, title, summary=""):
        """Rate article importance: HIGH, MEDIUM, LOW."""
        text = f"{title} {summary}".lower()

        for kw in HIGH_IMPORTANCE_KEYWORDS:
            if kw in text:
                return "HIGH"

        # Medium if it mentions specific stock actions
        medium_signals = ["result", "quarter", "order", "contract", "announce", "launch", "expand"]
        for kw in medium_signals:
            if kw in text:
                return "MEDIUM"

        return "LOW"

    def detect_sentiment(self, title, summary=""):
        """Simple keyword-based sentiment: POSITIVE, NEUTRAL, NEGATIVE."""
        text = f"{title} {summary}".lower()

        pos_count = sum(1 for kw in POSITIVE_KEYWORDS if kw in text)
        neg_count = sum(1 for kw in NEGATIVE_KEYWORDS if kw in text)

        if pos_count > neg_count and pos_count >= 1:
            return "POSITIVE"
        elif neg_count > pos_count and neg_count >= 1:
            return "NEGATIVE"
        return "NEUTRAL"


# ============================================================
# News Scheduler (Background Daemon Thread)
# ============================================================
class NewsScheduler:
    """
    Background daemon that polls RSS feeds every 60 seconds,
    processes new articles, and broadcasts them via SSE.
    """

    def __init__(self, db=None, sse_broadcaster=None):
        self.db = db
        self.sse_broadcaster = sse_broadcaster
        self.provider = RSSNewsProvider()
        self.deduper = NewsDeduplifier()
        self.mapper = StockMapper()
        self.classifier = NewsClassifier()

        self.poll_interval = int(os.getenv("NEWS_POLL_INTERVAL_MS", "60000")) / 1000
        self._running = False
        self._thread = None
        self._last_fetch = None
        self._stats = {
            "total_fetched": 0,
            "total_new": 0,
            "total_duplicates": 0,
            "total_errors": 0,
            "feeds_active": len(self.provider.feeds),
        }
        self._new_articles_queue = deque(maxlen=100)

    def start(self):
        """Start the background polling thread."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._thread.start()
        logger.info(f"NewsScheduler started (poll interval: {self.poll_interval}s)")

    def stop(self):
        """Stop the background polling thread."""
        self._running = False

    def get_health(self):
        """Return health/diagnostics info."""
        return {
            "status": "running" if self._running else "stopped",
            "last_fetch": self._last_fetch.isoformat() if self._last_fetch else None,
            "next_fetch": (self._last_fetch + timedelta(seconds=self.poll_interval)).isoformat() if self._last_fetch else None,
            "poll_interval_seconds": self.poll_interval,
            "feeds": [f["name"] for f in self.provider.feeds],
            "stats": self._stats,
        }

    def get_recent_articles(self):
        """Get recently fetched articles from memory queue."""
        return list(self._new_articles_queue)

    def _poll_loop(self):
        """Main polling loop — runs in background thread."""
        # Initial delay to let the app start up
        time.sleep(5)
        logger.info("NewsScheduler: Starting initial feed fetch...")

        # NOTE: On FastAPI there is no Flask app context. The scheduler uses
        # its OWN scoped SQLAlchemy session (imported lazily from app) so every
        # _save_to_db / _load_existing_fingerprints call opens a fresh session
        # per operation instead of relying on a request/app context.
        while self._running:
            try:
                self._do_fetch_cycle()
            except Exception as e:
                logger.error(f"NewsScheduler error: {e}")
                self._stats["total_errors"] += 1

            time.sleep(self.poll_interval)

    def _do_fetch_cycle(self):
        """Single fetch cycle: fetch → normalize → dedup → classify → save → broadcast."""
        self._last_fetch = datetime.now(timezone.utc)

        # 1. Fetch all feeds
        raw_articles = self.provider.fetch_all()
        self._stats["total_fetched"] += len(raw_articles)

        if not raw_articles:
            logger.debug("NewsScheduler: No articles fetched this cycle")
            return

        # 2. Load existing URLs for dedup (from DB if available)
        self._load_existing_fingerprints()

        # 3. Process each article
        new_articles = []
        duplicates = 0

        for article in raw_articles:
            # Dedup check
            if self.deduper.is_duplicate(article):
                duplicates += 1
                continue

            # Classify
            article["category"] = self.classifier.classify_category(
                article["title"], article.get("summary", ""),
                article.get("category_hint", "OTHER")
            )
            article["importance"] = self.classifier.score_importance(
                article["title"], article.get("summary", "")
            )
            article["sentiment"] = self.classifier.detect_sentiment(
                article["title"], article.get("summary", "")
            )

            # Map stocks
            article["symbols"] = self.mapper.detect_symbols(
                article["title"], article.get("summary", "")
            )
            article["companies"] = self.mapper.detect_companies(
                article["title"], article.get("summary", "")
            )

            # Mark as seen
            self.deduper.mark_seen(article)
            new_articles.append(article)

        self._stats["total_new"] += len(new_articles)
        self._stats["total_duplicates"] += duplicates

        if not new_articles:
            logger.debug(f"NewsScheduler: {len(raw_articles)} fetched, {duplicates} duplicates, 0 new")
            return

        logger.info(f"NewsScheduler: {len(new_articles)} NEW articles (of {len(raw_articles)} fetched, {duplicates} dupes)")

        # 4. Save to database
        saved_articles = self._save_to_db(new_articles)

        # 5. Add to in-memory queue
        for article in saved_articles:
            self._new_articles_queue.appendleft(article)

        # 6. Broadcast via SSE
        if self.sse_broadcaster:
            for article in saved_articles:
                try:
                    self.sse_broadcaster.broadcast(article)
                except Exception as e:
                    logger.error(f"SSE broadcast error: {e}")

    def _load_existing_fingerprints(self):
        """Load existing article URLs and title hashes from DB for dedup."""
        if not self.db:
            return
        session = None
        try:
            # Import here to avoid circular imports
            from app import NewsArticle
            # self.db is a session factory (SessionLocal); open one fresh session
            session = self.db() if callable(self.db) else self.db
            if session is None:
                return
            recent = session.query(NewsArticle).order_by(
                NewsArticle.published_at.desc()
            ).limit(500).all()

            urls = set()
            title_hashes = set()
            for a in recent:
                if a.canonical_url:
                    urls.add(a.canonical_url)
                title_hash = self.deduper._hash_title(a.title)
                title_hashes.add(title_hash)

            self.deduper.load_existing(urls, title_hashes)
        except Exception as e:
            logger.warning(f"Failed to load existing fingerprints: {e}")
        finally:
            if session is not None:
                try:
                    session.close()
                except Exception:
                    pass

    def _save_to_db(self, articles):
        """Save new articles to database. Returns list of saved article dicts.
        Uses INSERT ... ON CONFLICT DO NOTHING so duplicate canonical_url rows
        are silently skipped without raising UniqueViolation errors.
        """
        saved = []
        if not self.db:
            # No DB — return articles as-is with generated IDs
            for i, a in enumerate(articles):
                a["id"] = int(time.time() * 1000) + i
                saved.append(self._article_to_dict(a))
            return saved

        session = self.db() if callable(self.db) else self.db
        try:
            from app import NewsArticle
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            from sqlalchemy.dialects.sqlite import insert as sqlite_insert
            import sqlalchemy

            db_url = str(session.bind.url) if hasattr(session, 'bind') and session.bind else ""
            use_postgres = "postgresql" in db_url or "postgres" in db_url

            for a in articles:
                try:
                    row = {
                        "provider_id": str(a.get("provider_id", ""))[:255],
                        "title": a["title"][:500],
                        "summary": (a.get("summary") or "")[:2000],
                        "source": a.get("source", "Unknown")[:100],
                        "source_url": (a.get("source_url") or "")[:1000],
                        "canonical_url": (a.get("canonical_url") or "")[:1000],
                        "published_at": a.get("published_at"),
                        "fetched_at": a.get("fetched_at", datetime.now(timezone.utc)),
                        "category": a.get("category", "OTHER")[:50],
                        "symbols": json.dumps(a.get("symbols", [])),
                        "companies": json.dumps(a.get("companies", [])),
                        "image_url": (a.get("image_url") or "")[:1000] if a.get("image_url") else None,
                        "importance": a.get("importance", "LOW")[:10],
                        "sentiment": a.get("sentiment", "NEUTRAL")[:10],
                        "created_at": datetime.now(timezone.utc),
                    }

                    if use_postgres:
                        stmt = pg_insert(NewsArticle.__table__).values(**row)
                        stmt = stmt.on_conflict_do_nothing(index_elements=["canonical_url"])
                        result = session.execute(stmt)
                        session.flush()
                        # Fetch the inserted or existing row ID
                        inserted = result.inserted_primary_key
                        db_id = inserted[0] if inserted else None
                        if not db_id:
                            existing = session.query(NewsArticle.id).filter_by(
                                canonical_url=row["canonical_url"]
                            ).scalar()
                            db_id = existing
                    else:
                        # SQLite: use INSERT OR IGNORE
                        stmt = sqlite_insert(NewsArticle.__table__).values(**row)
                        stmt = stmt.on_conflict_do_nothing(index_elements=["canonical_url"])
                        result = session.execute(stmt)
                        session.flush()
                        db_id = result.lastrowid or None

                    saved.append(self._article_to_dict(a, db_id))

                except Exception as e:
                    logger.debug(f"Skipped article '{a['title'][:50]}': {e}")
                    session.rollback()
                    a["id"] = int(time.time() * 1000)
                    saved.append(self._article_to_dict(a))

            session.commit()
        except Exception as e:
            logger.error(f"DB commit failed: {e}")
            try:
                session.rollback()
            except Exception:
                pass
        finally:
            try:
                session.close()
            except Exception:
                pass

        return saved


    def _article_to_dict(self, article, db_id=None):
        """Convert article to JSON-serializable dict for API/SSE."""
        pub_at = article.get("published_at")
        if isinstance(pub_at, datetime):
            pub_at = pub_at.isoformat()

        fetched_at = article.get("fetched_at")
        if isinstance(fetched_at, datetime):
            fetched_at = fetched_at.isoformat()

        return {
            "id": db_id or article.get("id", int(time.time() * 1000)),
            "title": article.get("title", ""),
            "summary": article.get("summary", ""),
            "source": article.get("source", "Unknown"),
            "sourceUrl": article.get("source_url", ""),
            "publishedAt": pub_at,
            "fetchedAt": fetched_at,
            "category": article.get("category", "OTHER"),
            "symbols": article.get("symbols", []),
            "companies": article.get("companies", []),
            "imageUrl": article.get("image_url"),
            "importance": article.get("importance", "LOW"),
            "sentiment": article.get("sentiment", "NEUTRAL"),
        }


# Singleton
_scheduler = None

def get_scheduler():
    global _scheduler
    return _scheduler

def init_scheduler(db=None, sse_broadcaster=None):
    global _scheduler
    _scheduler = NewsScheduler(db=db, sse_broadcaster=sse_broadcaster)
    return _scheduler
