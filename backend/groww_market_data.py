import os
from growwapi import GrowwAPI

class GrowwMarketData:
    def __init__(self):
        token = os.getenv("GROWW_API_TOKEN")
        if not token:
            raise RuntimeError("GROWW_API_TOKEN environment variable is missing")
        self.groww = GrowwAPI(token)

    def get_option_chain(self, exchange, underlying, expiry_date):
        return self.groww.get_option_chain(
            exchange=exchange,
            underlying=underlying,
            expiry_date=expiry_date
        )

    def get_quote(self, exchange, segment, trading_symbol):
        return self.groww.get_quote(
            exchange=exchange,
            segment=segment,
            trading_symbol=trading_symbol
        )

    def get_ltp(self, segment, exchange_trading_symbols):
        return self.groww.get_ltp(
            segment=segment,
            exchange_trading_symbols=exchange_trading_symbols
        )

    def get_expiries(self, exchange, underlying):
        return self.groww.get_expiries(
            exchange=exchange,
            underlying=underlying
        )
