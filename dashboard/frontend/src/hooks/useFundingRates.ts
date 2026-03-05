import { useState, useEffect, useCallback } from "react";
import type { FundingRate } from "../lib/api";

const POLL_INTERVAL = 60_000;
const BINANCE_FUTURES = "https://fapi.binance.com";

// Thresholds matching MASTER_SKILL.md
const ARB_THRESHOLD = 0.0005;
const WATCH_THRESHOLD = 0.0001;

// Fee constants
const SPOT_TAKER_FEE = 0.001;
const FUTURES_TAKER_FEE = 0.0004;
const ROUND_TRIP_FEE = (SPOT_TAKER_FEE + FUTURES_TAKER_FEE) * 2;
const MIN_HOLD_PERIODS = 3;

interface PremiumIndex {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
}

function transform(r: PremiumIndex): FundingRate {
  const rate = parseFloat(r.lastFundingRate);
  const markPrice = parseFloat(r.markPrice);
  const indexPrice = parseFloat(r.indexPrice);
  const absRate = Math.abs(rate);

  const signal: FundingRate["signal"] =
    absRate >= ARB_THRESHOLD ? "ARB" : absRate >= WATCH_THRESHOLD ? "WATCH" : "NONE";

  const basis = indexPrice > 0 ? Math.abs(((markPrice - indexPrice) / indexPrice) * 100) : 0;
  const apy = absRate * 3 * 365 * 100;
  const netYield = (absRate * MIN_HOLD_PERIODS - ROUND_TRIP_FEE - basis / 100);

  const nowMs = Date.now();
  const nextFundingSec = Math.max(0, Math.floor((r.nextFundingTime - nowMs) / 1000));

  return {
    symbol: r.symbol,
    fundingRate: rate,
    estNetYield: netYield,
    apy,
    basis,
    nextFunding: nextFundingSec,
    openInterest: 0,
    signal,
  };
}

export function useFundingRates() {
  const [data, setData] = useState<FundingRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${BINANCE_FUTURES}/fapi/v1/premiumIndex`);
      if (!res.ok) throw new Error("Binance API " + res.status);

      const raw: PremiumIndex[] = await res.json();
      const rates = raw
        .filter((r) => r.symbol.endsWith("USDT"))
        .map(transform)
        .sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate));

      setData(rates);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRates();
    const interval = setInterval(fetchRates, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchRates]);

  return { data, loading, error, refetch: fetchRates };
}
