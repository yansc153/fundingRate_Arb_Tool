---
title: Funding Rate Arbitrage Agent
description: >
  Delta-neutral funding rate arbitrage strategy for Binance.
  Automatically scans USDT-M perpetual futures for high funding rates,
  executes synchronized spot long + futures short positions, collects
  funding payments every 8 hours, and closes positions when conditions change.
metadata:
  version: 1.0.0
  author: fundingArb
  license: MIT
  requires_skills:
    - binance/spot@1.0.1
    - binance-futures@1.0.0
    - binance-wallet@1.0.0
  skill_files:
    binance/spot: skills/binance-spot/SKILL.md
    binance-futures: skills/binance-futures/SKILL.md
    binance-wallet: skills/binance-wallet/SKILL.md
  risk_level: medium
  testnet_supported: true
---

# Funding Rate Arbitrage Agent — Complete Autonomous Strategy

> **READ THIS ENTIRE DOCUMENT BEFORE EXECUTING ANY ACTION.**
> This file is the single source of truth for the funding rate arbitrage strategy.
> You (the AI agent) must follow every instruction precisely, in order, with no deviation.
> If any instruction is ambiguous, default to the SAFEST interpretation (close positions, alert user).

---

## TABLE OF CONTENTS

1. [Activation](#1-activation)
2. [Strategy Overview](#2-strategy-overview)
3. [Complete State Machine](#3-complete-state-machine)
4. [Default Configuration](#4-default-configuration)
5. [Skills Orchestration — Exact API Calls](#5-skills-orchestration--exact-api-calls)
   - Phase 1: Scanning
   - Phase 2: Position Sizing
   - Phase 3: Pre-flight Risk Checks
   - Phase 4: Capital Transfer
   - Phase 5: Entry Execution
   - Phase 6: Position Monitoring
   - Phase 7: Exit Conditions
   - Phase 8: Exit Execution
   - Phase 9: Settlement
6. [User Communication Protocols](#6-user-communication-protocols)
7. [Telemetry (Opt-In)](#7-telemetry-opt-in)
8. [Safety Rules (CRITICAL)](#8-safety-rules-critical)
9. [Error Handling & Recovery](#9-error-handling--recovery)
10. [Glossary](#10-glossary)

---

## 1. ACTIVATION

### 1.1 Startup Sequence

When this agent is first activated, you MUST perform the following steps **before** any strategy logic runs:

**Step 1: Greet the user.**

Display:
```
==========================================================
  Funding Rate Arbitrage Agent v1.0.0
  Delta-neutral strategy for Binance USDT-M Perpetual
==========================================================
```

**Step 2: Generate session ID.**

```
session_id = generate_uuid_v4()
```
Store `session_id` in agent memory. This ID is used for:
- Telemetry heartbeats (if opted in)
- Trade tracking
- Session recovery

**Step 2.5: Load skill definitions.**

Read and internalize the following skill files. These contain the complete API specifications you will use throughout this strategy:

```
skills/binance-spot/SKILL.md      — Spot trading API (authentication, endpoints, examples)
skills/binance-futures/SKILL.md   — USDT-M Futures API (authentication, endpoints, examples)
skills/binance-wallet/SKILL.md    — Wallet transfer API (transfer types, endpoints)
```

You MUST understand the authentication/signing process, endpoint URLs, required parameters, and error codes from each skill file before proceeding. If any skill file is missing or unreadable, alert the user and HALT.

**Step 3: Ask for environment.**

```
Which environment would you like to use?
  1. TESTNET (recommended for first-time users)
  2. MAINNET (requires explicit confirmation)

Please choose [1/2]:
```

---

## 2. STRATEGY OVERVIEW

### 2.1 What Is Funding Rate Arbitrage?

Funding rate arbitrage is a **delta-neutral** trading strategy that profits from the periodic funding payments in perpetual futures contracts. Here is how it works in simple terms:

**The Core Idea:**
- Perpetual futures contracts have no expiry date, unlike traditional futures.
- To keep the futures price anchored to the spot price, exchanges use a **funding rate mechanism**.
- Every **8 hours** (at 00:00, 08:00, and 16:00 UTC on Binance), traders either pay or receive a funding payment based on the current funding rate.
- When the funding rate is **positive**: longs pay shorts. When **negative**: shorts pay longs.
- In bull markets, funding rates are typically **positive** because more traders are long (bullish), meaning **short sellers receive funding payments**.

**The Strategy:**
1. **Buy the asset on spot** (go long) — you now own the underlying asset.
2. **Short the same asset on perpetual futures** — you are short the derivative.
3. These two positions **cancel each other out** in terms of price exposure (delta neutral).
4. Every 8 hours, you **collect the funding payment** because you are short futures while the rate is positive.
5. When the funding rate drops or turns negative, you **close both positions** and take profit.

**Why It Works:**
- Your spot position gains when price goes up, and your futures position loses the same amount (and vice versa). Net price exposure: ~zero.
- But you still receive the funding payment from the exchange every 8 hours.
- This is essentially **earning yield** on a hedged position.

**Risks:**
- **Execution risk**: If one leg fills and the other does not, you are exposed to directional risk.
- **Basis risk**: Spot and futures prices can temporarily diverge.
- **Funding rate reversal**: Rates can turn negative, causing you to pay instead of receive.
- **Exchange risk**: Smart contract bugs, exchange downtime, or liquidity issues.
- **Fee drag**: Trading fees on entry and exit reduce net profit.

**Target Conditions:**
- Bull market with consistently positive funding rates (>0.01% per 8h, ideally >0.05%).
- Liquid assets with tight bid-ask spreads.
- Low price volatility during entry/exit execution windows.

### 2.2 Expected Returns

| Scenario | Funding Rate (8h) | Annual Yield (approx) | Notes |
|---|---|---|---|
| Conservative | 0.01% | ~10.95% | Barely covers fees |
| Normal | 0.03% | ~32.85% | Typical bull market |
| Aggressive | 0.10% | ~109.5% | Extreme conditions, unsustainable |

> These are gross yields. Net yields after fees depend on configuration (see Section 4).

---

## 3. COMPLETE STATE MACHINE

### 3.1 State Diagram

```
                    +--------+
                    |  IDLE  |
                    +---+----+
                        |
                        | Agent activated
                        v
                  +-----------+
             +--->| SCANNING  |<------------------------------+
             |    +-----+-----+                               |
             |          |                                      |
             |          | Candidate found (net_yield > threshold)
             |          v                                      |
             |  +------------------+                           |
             |  | OPPORTUNITY_FOUND|                           |
             |  +--------+---------+                           |
             |           |                                     |
             |           | Present to user                     |
             |           v                                     |
             |  +------------------+                           |
             |  | AWAITING_CONF    |-----> REJECT ------------>+
             |  +--------+---------+   (user declines or
             |           |              risk check fails)
             |           | User confirms
             |           v
             |  +------------------+
             |  | EXECUTING_ENTRY  |-----> EMERGENCY_CLOSE --->+
             |  +--------+---------+   (partial fill, error)   |
             |           |                                     |
             |           | Both legs filled                    |
             |           v                                     |
             |  +------------------+                           |
             |  | POSITION_HELD    |                           |
             |  +--------+---------+                           |
             |           |                                     |
             |           | Exit condition triggered            |
             |           v                                     |
             |  +------------------+                           |
             |  | EXIT_TRIGGERED   |                           |
             |  +--------+---------+                           |
             |           |                                     |
             |           | Execute exit                        |
             |           v                                     |
             |  +------------------+                           |
             |  | EXECUTING_EXIT   |-----> EMERGENCY_CLOSE --->+
             |  +--------+---------+   (exit leg fails)        |
             |           |                                     |
             |           | Both legs closed                    |
             |           v                                     |
             |  +------------------+                           |
             |  |   SETTLING       |                           |
             |  +--------+---------+                           |
             |           |                                     |
             |           | P&L calculated, reported            |
             |           +-------------------------------------+
             |
             +--- (loop continues scanning for next opportunity)
```

### 3.2 State Definitions and Transition Conditions

#### IDLE
- **Description**: Agent is initialized but not yet activated.
- **Entry condition**: Agent starts for the first time.
- **Actions**: Load configuration (Section 4).
- **Transition to SCANNING**: Environment selected AND API connectivity confirmed.

#### SCANNING
- **Description**: Agent is actively polling the Binance API for funding rate opportunities.
- **Entry condition**: Transitioned from IDLE, SETTLING, or REJECT.
- **Actions**: Execute Phase 1 (Section 5.1). Poll every `scanning_interval` seconds (default: 300s).
- **Transition to OPPORTUNITY_FOUND**: At least one symbol has `net_yield > entry_threshold` after fee deduction AND passes liquidity filter (24h volume > $10M).
- **Stay in SCANNING**: No qualifying opportunities found. Continue polling.
- **Transition to IDLE**: User explicitly requests stop. Agent halts.

#### OPPORTUNITY_FOUND
- **Description**: A candidate symbol has been identified.
- **Entry condition**: Scanning found a qualifying opportunity.
- **Actions**: Compute position sizing (Phase 2), run pre-flight risk checks (Phase 3). Present opportunity to user.
- **Transition to AWAITING_CONF**: Opportunity details and risk assessment presented to user.
- **Transition to REJECT**: Pre-flight risk checks fail (any single check). Log reason, return to SCANNING.

#### AWAITING_CONF
- **Description**: Waiting for explicit user confirmation to enter the position.
- **Entry condition**: Opportunity passed all pre-flight checks.
- **Actions**: Display entry report (Section 6), wait for user input.
- **Transition to EXECUTING_ENTRY**: User sends "CONFIRM", "confirm", "yes", "Y", "确认", or "开仓".
- **Transition to REJECT**: User sends "no", "N", "cancel", "取消", "拒绝". Or timeout after 300 seconds (5 minutes) with no response.
- **Transition to SCANNING**: User requests "skip" or "跳过" — skip this symbol, continue scanning.

#### EXECUTING_ENTRY
- **Description**: Actively placing orders on both spot and futures.
- **Entry condition**: User confirmed entry.
- **Actions**: Execute Phase 4 (capital transfer if needed), then Phase 5 (order placement).
- **Transition to POSITION_HELD**: Both spot BUY and futures SHORT orders filled successfully. Record entry prices, quantities, timestamps.
- **Transition to EMERGENCY_CLOSE**: Futures order fills but spot order fails (see Section 5.5 error handling). Or: API error during order placement after 3 retries.

#### POSITION_HELD
- **Description**: Both legs of the arbitrage position are open. Agent is monitoring.
- **Entry condition**: Successful entry execution.
- **Actions**: Execute Phase 6 (monitoring loop every `monitoring_interval` seconds). Evaluate exit conditions (Phase 7) on each monitoring cycle. Send 8h reports after each funding settlement.
- **Transition to EXIT_TRIGGERED**: Any exit condition from Phase 7 evaluates to true.
- **Transition to EMERGENCY_CLOSE**: Emergency exit condition triggered (Priority 1).

#### EXIT_TRIGGERED
- **Description**: An exit condition has been identified.
- **Entry condition**: Phase 7 evaluation returned a trigger.
- **Actions**: For Priority 2/3 exits: present exit recommendation to user, wait for confirmation (up to 120s). For Priority 1 (emergency): skip confirmation, proceed immediately. For Priority 4 (manual): proceed immediately.
- **Transition to EXECUTING_EXIT**: User confirms exit OR emergency condition OR manual close.
- **Transition to POSITION_HELD**: User declines non-emergency exit (Priority 2/3 only). Reset the trigger, continue monitoring. Log that user overrode exit recommendation.

#### EXECUTING_EXIT
- **Description**: Actively closing both legs of the position.
- **Entry condition**: Exit confirmed.
- **Actions**: Execute Phase 8 (close spot, close futures, transfer funds).
- **Transition to SETTLING**: Both legs closed successfully.
- **Transition to EMERGENCY_CLOSE**: One leg fails to close. Apply recovery logic (Section 9).

#### SETTLING
- **Description**: Position fully closed, calculating final P&L.
- **Entry condition**: Both legs confirmed closed.
- **Actions**: Execute Phase 9 (P&L calculation, reporting, optional telemetry).
- **Transition to SCANNING**: Settlement complete, user has not requested stop. Resume scanning.
- **Transition to IDLE**: User requests stop after settlement.

#### REJECT
- **Description**: Opportunity was rejected (by risk checks or user).
- **Entry condition**: Risk check failure or user decline.
- **Actions**: Log rejection reason. Clear candidate data.
- **Transition to SCANNING**: Automatic, immediate. Resume scanning.

#### EMERGENCY_CLOSE
- **Description**: Critical error state requiring immediate position unwinding.
- **Entry condition**: Partial fill, API failure during execution, or emergency exit trigger.
- **Actions**:
  1. Attempt to close any open futures position (market order, reduceOnly=true).
  2. Attempt to sell any spot holdings for the symbol (market order).
  3. Transfer all funds back to spot wallet.
  4. Send emergency alert to user (Section 6).
  5. Log all details for post-mortem.
- **Transition to SETTLING**: Emergency close orders filled. Calculate P&L including losses.
- **Retry logic**: If emergency close orders also fail, retry up to 5 times with 3-second delays. If still failing, alert user with: "CRITICAL: Unable to close positions automatically. Manual intervention required. [details]"

### 3.3 State Persistence

The agent MUST persist the following state data so that if the session is interrupted and resumed, it can recover:

```yaml
persistent_state:
  current_state: <state_name>
  session_id: <uuid>
  environment: testnet | mainnet
  active_positions:
    - symbol: <string>
      spot_order_id: <string>
      futures_order_id: <string>
      spot_entry_price: <float>
      futures_entry_price: <float>
      spot_quantity: <float>
      futures_quantity: <float>
      entry_timestamp: <iso8601>
      funding_collected_usdt: <float>
      funding_periods_held: <int>
      last_monitoring_timestamp: <iso8601>
  rejected_symbols: [<string>, ...]  # symbols rejected in current scan cycle
  scanning_since: <iso8601>
  last_heartbeat: <iso8601>
```

---

## 4. DEFAULT CONFIGURATION

The following YAML block defines ALL configurable parameters with their default values. The agent MUST use these defaults unless the user explicitly overrides them.

```yaml
# =============================================================================
# STRATEGY PARAMETERS
# =============================================================================
strategy:
  # Minimum funding rate (per 8h period) to consider entry.
  # 0.0005 = 0.05% per 8h. Below this, fees eat the profit.
  entry_threshold: 0.0005

  # Funding rate below which we consider exiting (per 8h period).
  # 0.0001 = 0.01% per 8h.
  exit_threshold: 0.0001

  # Maximum number of concurrent arbitrage positions.
  max_concurrent_positions: 3

  # Leverage for futures position. MUST be 1 for arbitrage.
  # Higher leverage increases liquidation risk without increasing arb yield.
  leverage: 1

  # Maximum percentage of available capital to use per position.
  max_capital_pct: 0.20

  # Maximum absolute position size in USDT.
  max_position_usdt: 10000

  # Minimum position size in USDT. Below this, fees dominate.
  min_position_usdt: 100

  # Minimum 24h trading volume (USDT) for a symbol to be considered.
  min_24h_volume_usdt: 10000000

  # Number of top candidates to evaluate after initial filter.
  top_candidates: 5

  # Minimum number of funding periods to hold before considering strategy exit.
  min_hold_periods: 3

# =============================================================================
# RISK PARAMETERS
# =============================================================================
risk:
  # Maximum margin ratio before emergency close (0-1 scale).
  # 0.80 = 80%. Binance liquidates around 100%.
  max_margin_ratio: 0.80

  # Margin ratio threshold for warning (not emergency).
  warn_margin_ratio: 0.50

  # Maximum combined P&L loss percentage before risk stop.
  # -0.015 = -1.5%. Negative number.
  stop_loss_pct: -0.015

  # Target profit percentage for strategy take-profit exit.
  # 0.02 = +2%.
  take_profit_pct: 0.02

  # Maximum allowed orderbook slippage on entry (each leg).
  max_slippage_pct: 0.003

  # Maximum consecutive API errors before emergency close.
  max_consecutive_api_errors: 3

  # Proximity to liquidation price that triggers emergency (percentage).
  liquidation_proximity_pct: 0.05

# =============================================================================
# FEE PARAMETERS
# =============================================================================
fees:
  # Spot trading fee (taker). Binance default without BNB discount.
  spot_taker_fee: 0.001

  # Spot trading fee (maker).
  spot_maker_fee: 0.001

  # Futures trading fee (taker). Binance USDT-M default.
  futures_taker_fee: 0.0004

  # Futures trading fee (maker).
  futures_maker_fee: 0.0002

  # Whether to use BNB for fee discount (requires BNB balance).
  use_bnb_discount: false

  # BNB discount multiplier (0.75 = 25% discount).
  bnb_discount_multiplier: 0.75

# =============================================================================
# EXECUTION PARAMETERS
# =============================================================================
execution:
  # Environment: "testnet" or "mainnet".
  # ALWAYS start on testnet. Mainnet requires explicit confirmation.
  environment: testnet

  # Scanning interval in seconds (how often to check funding rates).
  scanning_interval: 300

  # Monitoring interval in seconds (how often to check open positions).
  monitoring_interval: 1800

  # Order timeout in seconds (how long to wait for fill before cancelling).
  order_timeout: 30

  # Maximum retries for API calls before considering it a failure.
  max_api_retries: 3

  # Delay between API retries in seconds.
  api_retry_delay: 2

  # Delay between placing futures and spot orders in milliseconds.
  inter_leg_delay_ms: 500

  # Whether to use market orders (true) or limit orders at best bid/ask (false).
  use_market_orders: true

# =============================================================================
# API ENDPOINTS (Binance)
# =============================================================================
endpoints:
  testnet:
    spot_base: "https://testnet.binance.vision"
    futures_base: "https://testnet.binancefuture.com"
  mainnet:
    spot_base: "https://api.binance.com"
    futures_base: "https://fapi.binance.com"

# =============================================================================
# TELEMETRY
# =============================================================================
telemetry:
  # Whether telemetry is enabled. Must be opted-in by user.
  enabled: false

  # Base URL for telemetry API.
  base_url: "https://arb.astock.me"

  # Heartbeat interval in seconds.
  heartbeat_interval: 1800

# =============================================================================
# NOTIFICATION / COMMUNICATION
# =============================================================================
communication:
  # Language for reports: "en", "zh", or "both".
  language: both

  # Whether to ask for confirmation before entry.
  confirm_before_entry: true

  # Whether to ask for confirmation before non-emergency exit.
  confirm_before_exit: true

  # Timeout for user confirmation in seconds.
  confirmation_timeout: 300
```

### 4.1 Configuration Override

Users can override any parameter by saying, for example:
- "Set entry threshold to 0.001"
- "Change max position to 5000 USDT"
- "Switch to mainnet" (requires double confirmation)
- "Set language to Chinese"

When overriding, echo the change back to the user:
```
Configuration updated:
  entry_threshold: 0.0005 -> 0.001
```

### 4.2 Environment Switching

Switching from testnet to mainnet requires:
1. User explicitly requests mainnet.
2. Agent displays warning: "You are switching to MAINNET. Real funds will be used. Type 'CONFIRM MAINNET' to proceed."
3. User types exactly "CONFIRM MAINNET" or "确认主网".
4. Only then switch `execution.environment` to `mainnet` and update API base URLs.

Switching from mainnet to testnet can be done immediately without confirmation (it is always safer).

---

## 5. SKILLS ORCHESTRATION — EXACT API CALLS

> **IMPORTANT**: All API calls use the following skill definitions. You MUST read and follow the detailed API documentation in each skill file:
>
> | Skill | File | Description |
> |-------|------|-------------|
> | `binance/spot@1.0.1` | `skills/binance-spot/SKILL.md` | Spot trading: orders, account, market data (15+ endpoints) |
> | `binance-futures@1.0.0` | `skills/binance-futures/SKILL.md` | USDT-M perpetual futures (32 endpoints) |
> | `binance-wallet@1.0.0` | `skills/binance-wallet/SKILL.md` | Wallet transfers between spot ↔ futures (6 endpoints, 14 transfer types) |
>
> Each skill file contains: authentication/signing instructions, complete endpoint specifications, request/response examples, error codes, and rate limits. The agent must invoke these skills with the exact endpoints, methods, and parameters documented below and in the skill files.

> **BASE URLs**: Use `endpoints.testnet.*` or `endpoints.mainnet.*` depending on `execution.environment`.

### 5.1 Phase 1: Scanning

**Objective**: Find the highest-yielding funding rate opportunity.

**Step 1.1: Fetch all premium index data.**

```
SKILL: binance-futures
METHOD: GET
ENDPOINT: /fapi/v1/premiumIndex
PARAMETERS: none (returns all symbols)
```

Expected response (array):
```json
[
  {
    "symbol": "BTCUSDT",
    "markPrice": "43250.12345678",
    "indexPrice": "43245.67890123",
    "estimatedSettlePrice": "43248.00000000",
    "lastFundingRate": "0.00035000",
    "nextFundingTime": 1703980800000,
    "interestRate": "0.00010000",
    "time": 1703970000000
  },
  ...
]
```

**Step 1.2: Filter and rank.**

For each symbol in the response:

```
1. Parse lastFundingRate as float: funding_rate
2. FILTER: funding_rate >= strategy.entry_threshold (default 0.0005)
3. FILTER: symbol ends with "USDT" (we only trade USDT-margined perps)
4. FILTER: symbol NOT in rejected_symbols list (already rejected this cycle)
```

**Step 1.3: Fetch 24h ticker for volume filter.**

For each symbol that passed the filter:

```
SKILL: binance-futures
METHOD: GET
ENDPOINT: /fapi/v1/ticker/24hr
PARAMETERS:
  symbol: <symbol>
```

Response fields needed:
```json
{
  "symbol": "BTCUSDT",
  "quoteVolume": "12345678901.23",  // 24h volume in USDT
  "lastPrice": "43250.00",
  "priceChangePercent": "-1.23"
}
```

```
FILTER: quoteVolume >= strategy.min_24h_volume_usdt (default 10,000,000)
```

**Step 1.4: Compute net yield.**

For each remaining candidate:

```python
# Gross yield per 8h period
gross_yield_8h = funding_rate

# Entry fees (both legs)
entry_fee = fees.spot_taker_fee + fees.futures_taker_fee
# Default: 0.001 + 0.0004 = 0.0014

# Exit fees (both legs)
exit_fee = fees.spot_taker_fee + fees.futures_taker_fee
# Default: 0.001 + 0.0004 = 0.0014

# Total round-trip fee
total_fee = entry_fee + exit_fee
# Default: 0.0028

# Basis cost (spot vs futures price difference)
basis_pct = abs(mark_price - index_price) / index_price

# Net yield assuming minimum hold of min_hold_periods
net_yield = (gross_yield_8h * strategy.min_hold_periods) - total_fee - basis_pct

# Annualized yield (for display only)
annual_yield = gross_yield_8h * 3 * 365  # 3 periods per day * 365 days
```

**Step 1.5: Rank and select.**

```
1. Sort candidates by net_yield DESCENDING.
2. Take top strategy.top_candidates (default 5).
3. Select the #1 candidate as the primary opportunity.
4. Store the full ranked list for user display.
```

**Step 1.6: If no candidates pass all filters**, remain in SCANNING state. Log:
```
[SCAN] No qualifying opportunities found. Next scan in <scanning_interval>s.
Highest funding rate seen: <symbol> at <rate>% (filtered out because: <reason>).
```

### 5.2 Phase 2: Position Sizing

**Objective**: Determine exact quantities for spot and futures legs.

**Step 2.1: Fetch spot account balance.**

```
SKILL: binance/spot
METHOD: GET
ENDPOINT: /api/v3/account
PARAMETERS: none (requires API key authentication)
HEADERS:
  X-MBX-APIKEY: <api_key>
SIGNED: yes (requires timestamp and signature)
```

From the response, extract:
```python
spot_usdt_balance = float(next(
    b["free"] for b in response["balances"] if b["asset"] == "USDT"
))
```

**Step 2.2: Fetch futures account balance.**

```
SKILL: binance-futures
METHOD: GET
ENDPOINT: /fapi/v2/account
PARAMETERS: none (requires API key authentication)
HEADERS:
  X-MBX-APIKEY: <api_key>
SIGNED: yes
```

From the response, extract:
```python
futures_usdt_balance = float(response["availableBalance"])
futures_total_balance = float(response["totalWalletBalance"])
```

**Step 2.3: Compute position size.**

```python
# Total available capital across both wallets
total_available = spot_usdt_balance + futures_usdt_balance

# Position size calculation
position_size_usdt = min(
    total_available * strategy.max_capital_pct,   # 20% of available
    strategy.max_position_usdt                     # 10000 USDT cap
)

# Round down to whole USDT
position_size_usdt = math.floor(position_size_usdt)

# Check minimum
if position_size_usdt < strategy.min_position_usdt:
    # REJECT: insufficient capital
    log("Insufficient capital. Need at least {min_position_usdt} USDT, have {position_size_usdt} USDT available for this position.")
    transition_to(REJECT)
```

**Step 2.4: Compute per-leg quantities.**

```python
# Get current price for the symbol
# (already fetched in Phase 1 from premiumIndex: indexPrice)
current_price = float(candidate["indexPrice"])

# Spot quantity (what we buy on spot market)
spot_qty_raw = position_size_usdt / current_price

# Futures quantity (what we short on futures market)
# Must match spot quantity for delta neutrality
futures_qty_raw = spot_qty_raw
```

**Step 2.5: Fetch symbol trading rules for precision.**

```
SKILL: binance/spot
METHOD: GET
ENDPOINT: /api/v3/exchangeInfo
PARAMETERS:
  symbol: <symbol_without_suffix>  # e.g., "BTCUSDT"
```

Extract from `symbols[0].filters`:
- `LOT_SIZE.stepSize` -> `spot_step_size`
- `LOT_SIZE.minQty` -> `spot_min_qty`
- `PRICE_FILTER.tickSize` -> `spot_tick_size`
- `MIN_NOTIONAL.minNotional` -> `spot_min_notional`

```
SKILL: binance-futures
METHOD: GET
ENDPOINT: /fapi/v1/exchangeInfo
PARAMETERS: none
```

Find the matching symbol and extract:
- `quantityPrecision` -> `futures_qty_precision`
- `pricePrecision` -> `futures_price_precision`
- `filters[LOT_SIZE].stepSize` -> `futures_step_size`
- `filters[LOT_SIZE].minQty` -> `futures_min_qty`
- `filters[MIN_NOTIONAL].notional` -> `futures_min_notional`

**Step 2.6: Round quantities to valid precision.**

```python
def round_step(value, step_size):
    """Round down to nearest valid step."""
    precision = len(str(step_size).rstrip('0').split('.')[-1])
    return math.floor(value / step_size) * step_size

spot_qty = round_step(spot_qty_raw, spot_step_size)
futures_qty = round_step(futures_qty_raw, futures_step_size)

# Ensure quantities are equal (use the smaller of the two after rounding)
final_qty = min(spot_qty, futures_qty)
spot_qty = round_step(final_qty, spot_step_size)
futures_qty = round_step(final_qty, futures_step_size)
```

**Step 2.7: Validate minimum notional.**

```python
notional = final_qty * current_price
if notional < max(float(spot_min_notional), float(futures_min_notional)):
    log("Position size below minimum notional requirement.")
    transition_to(REJECT)
```

**Step 2.8: Compute required capital per wallet.**

```python
# Spot wallet needs enough for the buy
spot_required = spot_qty * current_price * (1 + fees.spot_taker_fee)

# Futures wallet needs margin (at leverage=1, same as notional)
futures_required = futures_qty * current_price * (1 + fees.futures_taker_fee)

# Determine if transfer is needed
need_transfer_to_futures = futures_usdt_balance < futures_required
need_transfer_to_spot = spot_usdt_balance < spot_required
transfer_amount = 0

if need_transfer_to_futures and not need_transfer_to_spot:
    transfer_amount = futures_required - futures_usdt_balance + 10  # 10 USDT buffer
    transfer_direction = "MAIN_UMFUTURE"
elif need_transfer_to_spot and not need_transfer_to_futures:
    transfer_amount = spot_required - spot_usdt_balance + 10
    transfer_direction = "UMFUTURE_MAIN"
elif need_transfer_to_futures and need_transfer_to_spot:
    log("Insufficient total capital to fund both legs.")
    transition_to(REJECT)
```

### 5.3 Phase 3: Pre-flight Risk Checks

**Objective**: Verify ALL risk conditions before committing capital.

ALL of the following checks MUST pass. If ANY single check fails, transition to REJECT.

**Check 1: Position count.**

```python
active_position_count = len(persistent_state.active_positions)
if active_position_count >= strategy.max_concurrent_positions:
    reject("Maximum concurrent positions ({max_concurrent_positions}) reached.")
```

**Check 2: Margin ratio.**

```
SKILL: binance-futures
METHOD: GET
ENDPOINT: /fapi/v2/account
PARAMETERS: none
SIGNED: yes
```

```python
total_margin_balance = float(response["totalMarginBalance"])
total_maintenance_margin = float(response["totalMaintMargin"])

if total_margin_balance > 0:
    margin_ratio = total_maintenance_margin / total_margin_balance
else:
    margin_ratio = 0

if margin_ratio >= risk.warn_margin_ratio:  # 0.50
    reject(f"Margin ratio too high: {margin_ratio:.2%}. Must be below {risk.warn_margin_ratio:.0%}.")
```

**Check 3: Minimum position size.**

```python
if position_size_usdt < strategy.min_position_usdt:  # 100
    reject(f"Position size {position_size_usdt} USDT below minimum {strategy.min_position_usdt} USDT.")
```

**Check 4: Orderbook slippage — spot.**

```
SKILL: binance/spot
METHOD: GET
ENDPOINT: /api/v3/depth
PARAMETERS:
  symbol: <symbol>
  limit: 20
```

```python
# Calculate expected slippage for a market buy of spot_qty
total_filled = 0
total_cost = 0
for ask_price, ask_qty in response["asks"]:
    fill_qty = min(float(ask_qty), spot_qty - total_filled)
    total_cost += fill_qty * float(ask_price)
    total_filled += fill_qty
    if total_filled >= spot_qty:
        break

avg_fill_price = total_cost / total_filled if total_filled > 0 else 0
best_ask = float(response["asks"][0][0])
spot_slippage = (avg_fill_price - best_ask) / best_ask

if spot_slippage > risk.max_slippage_pct:  # 0.003
    reject(f"Spot orderbook slippage too high: {spot_slippage:.4%} > {risk.max_slippage_pct:.2%}.")
```

**Check 5: Orderbook slippage — futures.**

```
SKILL: binance-futures
METHOD: GET
ENDPOINT: /fapi/v1/depth
PARAMETERS:
  symbol: <symbol>
  limit: 20
```

```python
# Calculate expected slippage for a market sell (short) of futures_qty
total_filled = 0
total_proceeds = 0
for bid_price, bid_qty in response["bids"]:
    fill_qty = min(float(bid_qty), futures_qty - total_filled)
    total_proceeds += fill_qty * float(bid_price)
    total_filled += fill_qty
    if total_filled >= futures_qty:
        break

avg_fill_price = total_proceeds / total_filled if total_filled > 0 else 0
best_bid = float(response["bids"][0][0])
futures_slippage = (best_bid - avg_fill_price) / best_bid

if futures_slippage > risk.max_slippage_pct:  # 0.003
    reject(f"Futures orderbook slippage too high: {futures_slippage:.4%} > {risk.max_slippage_pct:.2%}.")
```

**Check 6: Symbol not in cooldown.**

```python
# If we recently rejected or exited this symbol, wait at least 1 hour
if symbol in recently_exited and (now - recently_exited[symbol]) < timedelta(hours=1):
    reject(f"Symbol {symbol} in cooldown period. Exited {format_duration(now - recently_exited[symbol])} ago.")
```

**All checks passed**: Log all check results and proceed to Phase 4.

### 5.4 Phase 4: Capital Transfer

**Objective**: Ensure both wallets have sufficient funds.

**Only execute if `transfer_amount > 0` (determined in Phase 2, Step 2.8).**

**Step 4.1: Execute transfer.**

```
SKILL: binance-wallet
METHOD: POST
ENDPOINT: /sapi/v1/asset/transfer
PARAMETERS:
  type: <transfer_direction>    # "MAIN_UMFUTURE" or "UMFUTURE_MAIN"
  asset: "USDT"
  amount: <transfer_amount>     # string, e.g., "1500.00"
SIGNED: yes
```

Expected response:
```json
{
  "tranId": 13526853623
}
```

**Step 4.2: Wait and verify.**

Wait 2 seconds (to allow settlement).

Then verify the transfer completed:

```
SKILL: binance-wallet
METHOD: GET
ENDPOINT: /sapi/v1/asset/transfer
PARAMETERS:
  type: <transfer_direction>
  startTime: <timestamp_5_minutes_ago>
  size: 1
SIGNED: yes
```

```python
if response["rows"][0]["tranId"] == tranId and response["rows"][0]["status"] == "CONFIRMED":
    log(f"Transfer verified: {transfer_amount} USDT ({transfer_direction})")
else:
    # Retry once more after 3 seconds
    wait(3)
    # Re-check. If still not confirmed:
    reject("Capital transfer failed to confirm. Aborting entry.")
```

**Step 4.3: Re-verify balances.**

After transfer, re-fetch both account balances (repeat Steps 2.1 and 2.2) and confirm:
```python
assert spot_usdt_balance >= spot_required
assert futures_usdt_balance >= futures_required
```

If either assertion fails, transition to REJECT.

### 5.5 Phase 5: Entry Execution

**Objective**: Open both legs of the arbitrage position atomically.

> **CRITICAL RULE**: Always place the **futures SHORT first**, then the **spot BUY**.
> Rationale: If the futures short fills and then spot buy fails, we can immediately reverse the futures position. But if spot buy fills first and futures short fails, we are left with unhedged spot exposure in a potentially falling market.

**Step 5.0: Set leverage to 1x.**

```
SKILL: binance-futures
METHOD: POST
ENDPOINT: /fapi/v1/leverage
PARAMETERS:
  symbol: <symbol>
  leverage: 1
SIGNED: yes
```

Verify response:
```json
{
  "leverage": 1,
  "maxNotionalValue": "...",
  "symbol": "BTCUSDT"
}
```

If leverage != 1 in response, ABORT. Do not proceed.

**Step 5.1: Set margin type to CROSSED (if not already).**

```
SKILL: binance-futures
METHOD: POST
ENDPOINT: /fapi/v1/marginType
PARAMETERS:
  symbol: <symbol>
  marginType: "CROSSED"
SIGNED: yes
```

Note: This may return error code -4046 "No need to change margin type" if already set. This is fine, continue.

**Step 5.2: Place futures SHORT order.**

```
SKILL: binance-futures
METHOD: POST
ENDPOINT: /fapi/v1/order
PARAMETERS:
  symbol: <symbol>
  side: "SELL"
  type: "MARKET"
  quantity: <futures_qty>       # string, properly rounded
  newOrderRespType: "RESULT"    # get fill details in response
SIGNED: yes
```

Expected response:
```json
{
  "orderId": 283194212,
  "symbol": "BTCUSDT",
  "status": "FILLED",
  "clientOrderId": "...",
  "price": "0",
  "avgPrice": "43250.50000",
  "origQty": "0.023",
  "executedQty": "0.023",
  "cumQuote": "994.76150",
  "type": "MARKET",
  "side": "SELL",
  "updateTime": 1703970123456
}
```

```python
if response["status"] != "FILLED":
    # Wait up to order_timeout seconds for fill
    wait(execution.order_timeout)
    # Re-check order status
    # GET /fapi/v1/order?symbol=<symbol>&orderId=<orderId>
    if still not filled:
        # Cancel the order
        # DELETE /fapi/v1/order?symbol=<symbol>&orderId=<orderId>
        reject("Futures order did not fill within timeout.")

futures_entry_price = float(response["avgPrice"])
futures_filled_qty = float(response["executedQty"])
futures_order_id = response["orderId"]
```

**Step 5.3: Brief delay.**

Wait `execution.inter_leg_delay_ms` milliseconds (default 500ms) between legs.

**Step 5.4: Place spot BUY order.**

```
SKILL: binance/spot
METHOD: POST
ENDPOINT: /api/v3/order
PARAMETERS:
  symbol: <symbol>
  side: "BUY"
  type: "MARKET"
  quantity: <spot_qty>          # string, properly rounded
  newOrderRespType: "RESULT"
SIGNED: yes
```

Expected response:
```json
{
  "symbol": "BTCUSDT",
  "orderId": 28,
  "clientOrderId": "...",
  "transactTime": 1703970124000,
  "price": "0.00000000",
  "origQty": "0.02300000",
  "executedQty": "0.02300000",
  "cummulativeQuoteQty": "994.85000000",
  "status": "FILLED",
  "type": "MARKET",
  "side": "BUY",
  "fills": [
    {
      "price": "43254.34",
      "qty": "0.023",
      "commission": "0.00002300",
      "commissionAsset": "BTC"
    }
  ]
}
```

```python
if response["status"] != "FILLED":
    # CRITICAL: Futures is already open. We MUST either fill spot or reverse futures.
    wait(execution.order_timeout)
    # Re-check spot order status
    # GET /api/v3/order?symbol=<symbol>&orderId=<orderId>
    if still not filled:
        # Cancel spot order
        # DELETE /api/v3/order?symbol=<symbol>&orderId=<orderId>
        # IMMEDIATELY reverse futures
        log("CRITICAL: Spot order failed. Reversing futures position.")
        goto EMERGENCY_REVERSE_FUTURES

spot_entry_price = sum(float(f["price"]) * float(f["qty"]) for f in response["fills"]) / float(response["executedQty"])
spot_filled_qty = float(response["executedQty"])
spot_order_id = response["orderId"]
```

**Step 5.5: Emergency Futures Reversal (if spot fails).**

```
SKILL: binance-futures
METHOD: POST
ENDPOINT: /fapi/v1/order
PARAMETERS:
  symbol: <symbol>
  side: "BUY"
  type: "MARKET"
  quantity: <futures_filled_qty>
  reduceOnly: "true"
  newOrderRespType: "RESULT"
SIGNED: yes
```

After reversal, transition to EMERGENCY_CLOSE state.

**Step 5.6: Record position.**

If both legs filled successfully:

```python
new_position = {
    "symbol": symbol,
    "spot_order_id": spot_order_id,
    "futures_order_id": futures_order_id,
    "spot_entry_price": spot_entry_price,
    "futures_entry_price": futures_entry_price,
    "spot_quantity": spot_filled_qty,
    "futures_quantity": futures_filled_qty,
    "entry_timestamp": datetime.utcnow().isoformat(),
    "funding_collected_usdt": 0.0,
    "funding_periods_held": 0,
    "last_monitoring_timestamp": datetime.utcnow().isoformat()
}
persistent_state.active_positions.append(new_position)
```

Transition to POSITION_HELD.

### 5.6 Phase 6: Position Monitoring

**Objective**: Continuously monitor open positions and collect funding data.

This phase runs in a loop every `execution.monitoring_interval` seconds (default 1800s = 30 min).

**Step 6.1: Fetch current funding rate.**

```
SKILL: binance-futures
METHOD: GET
ENDPOINT: /fapi/v1/premiumIndex
PARAMETERS:
  symbol: <symbol>
```

```python
current_funding_rate = float(response["lastFundingRate"])
next_funding_time = int(response["nextFundingTime"])
```

**Step 6.2: Fetch position risk.**

```
SKILL: binance-futures
METHOD: GET
ENDPOINT: /fapi/v2/positionRisk
PARAMETERS:
  symbol: <symbol>
SIGNED: yes
```

```python
for pos in response:
    if pos["symbol"] == symbol and float(pos["positionAmt"]) != 0:
        futures_unrealized_pnl = float(pos["unRealizedProfit"])
        futures_entry_price_check = float(pos["entryPrice"])
        futures_mark_price = float(pos["markPrice"])
        liquidation_price = float(pos["liquidationPrice"])
        futures_margin_type = pos["marginType"]
        leverage_check = int(pos["leverage"])
```

**Step 6.3: Fetch account margin ratio.**

```
SKILL: binance-futures
METHOD: GET
ENDPOINT: /fapi/v2/account
PARAMETERS: none
SIGNED: yes
```

```python
margin_ratio = float(response["totalMaintMargin"]) / float(response["totalMarginBalance"]) if float(response["totalMarginBalance"]) > 0 else 0
```

**Step 6.4: Check spot balance.**

```
SKILL: binance/spot
METHOD: GET
ENDPOINT: /api/v3/account
PARAMETERS: none
SIGNED: yes
```

```python
spot_asset = symbol.replace("USDT", "")  # e.g., "BTC"
spot_balance = float(next(
    b["free"] for b in response["balances"] if b["asset"] == spot_asset
))
spot_current_value = spot_balance * futures_mark_price  # use futures mark as proxy
spot_pnl = spot_current_value - (position.spot_entry_price * position.spot_quantity)
```

**Step 6.5: Fetch funding income history.**

```
SKILL: binance-futures
METHOD: GET
ENDPOINT: /fapi/v1/income
PARAMETERS:
  symbol: <symbol>
  incomeType: "FUNDING_FEE"
  startTime: <position.entry_timestamp as ms>
  limit: 100
SIGNED: yes
```

```python
funding_income_records = response  # array of income records
total_funding = sum(float(r["income"]) for r in funding_income_records)
funding_periods = len(funding_income_records)

# Update position state
position.funding_collected_usdt = total_funding
position.funding_periods_held = funding_periods
```

**Step 6.6: Compute combined P&L.**

```python
# Spot P&L (unrealized)
spot_pnl_usdt = spot_pnl  # calculated in Step 6.4

# Futures P&L (unrealized)
futures_pnl_usdt = futures_unrealized_pnl  # from Step 6.2

# Funding collected (realized)
funding_pnl_usdt = total_funding  # from Step 6.5 (positive = we received)

# Total fees paid on entry
entry_fees_usdt = (
    position.spot_entry_price * position.spot_quantity * fees.spot_taker_fee +
    position.futures_entry_price * position.futures_quantity * fees.futures_taker_fee
)

# Combined P&L
combined_pnl_usdt = spot_pnl_usdt + futures_pnl_usdt + funding_pnl_usdt - entry_fees_usdt

# P&L as percentage of position size
position_value = position.spot_entry_price * position.spot_quantity
combined_pnl_pct = combined_pnl_usdt / position_value if position_value > 0 else 0
```

**Step 6.7: Update monitoring timestamp.**

```python
position.last_monitoring_timestamp = datetime.utcnow().isoformat()
```

**Step 6.8: Evaluate exit conditions.**

Proceed to Phase 7 with the computed data.

**Step 6.9: Generate 8h funding report.**

After each funding settlement (detected when `funding_periods` increases), generate a monitoring report (see Section 6.2).

### 5.7 Phase 7: Exit Conditions

**Objective**: Determine if any exit condition is triggered.

Evaluate in strict priority order. The FIRST condition that matches takes effect.

#### PRIORITY 1 — EMERGENCY (Immediate, no user confirmation)

**Condition 1a: Margin ratio critical.**
```python
if margin_ratio > risk.max_margin_ratio:  # 0.80
    trigger_exit(priority=1, reason="EMERGENCY: Margin ratio {margin_ratio:.2%} exceeds {max_margin_ratio:.0%}")
```

**Condition 1b: Liquidation proximity.**
```python
if liquidation_price > 0:
    proximity = abs(futures_mark_price - liquidation_price) / futures_mark_price
    if proximity < risk.liquidation_proximity_pct:  # 0.05
        trigger_exit(priority=1, reason=f"EMERGENCY: Price within {proximity:.2%} of liquidation ({liquidation_price})")
```

**Condition 1c: Consecutive API errors.**
```python
if consecutive_api_errors >= risk.max_consecutive_api_errors:  # 3
    trigger_exit(priority=1, reason=f"EMERGENCY: {consecutive_api_errors} consecutive API errors")
```

#### PRIORITY 2 — RISK STOP (Ask user, but recommend close)

**Condition 2a: Stop loss hit.**
```python
if combined_pnl_pct < risk.stop_loss_pct:  # -0.015
    trigger_exit(priority=2, reason=f"RISK: Combined P&L {combined_pnl_pct:.2%} below stop loss {stop_loss_pct:.2%}")
```

**Condition 2b: Funding rate inverted + negative P&L.**
```python
if current_funding_rate < 0 and combined_pnl_pct < 0:
    trigger_exit(priority=2, reason=f"RISK: Funding rate inverted ({current_funding_rate:.4%}) and P&L negative ({combined_pnl_pct:.2%})")
```

#### PRIORITY 3 — STRATEGY (Ask user, suggest close)

**Condition 3a: Funding rate below exit threshold.**
```python
if current_funding_rate < strategy.exit_threshold:  # 0.0001
    trigger_exit(priority=3, reason=f"STRATEGY: Funding rate {current_funding_rate:.4%} below exit threshold {exit_threshold:.4%}")
```

**Condition 3b: Minimum hold achieved + take profit.**
```python
if (position.funding_periods_held >= strategy.min_hold_periods and
    combined_pnl_pct > risk.take_profit_pct):  # +2%
    trigger_exit(priority=3, reason=f"STRATEGY: Take profit reached ({combined_pnl_pct:.2%}) after {position.funding_periods_held} funding periods")
```

**Condition 3c: Minimum hold achieved + rate dropping.**
```python
if (position.funding_periods_held >= strategy.min_hold_periods and
    current_funding_rate < strategy.entry_threshold * 0.5):  # rate dropped below half of entry threshold
    trigger_exit(priority=3, reason=f"STRATEGY: Funding rate declining ({current_funding_rate:.4%}), held {position.funding_periods_held} periods")
```

#### PRIORITY 4 — MANUAL (Immediate, user-initiated)

**Condition 4a: User command.**
```python
user_exit_commands = ["close", "exit", "平仓", "关仓", "stop", "停止"]
if user_message.lower().strip() in user_exit_commands:
    trigger_exit(priority=4, reason="MANUAL: User requested position close")
```

### 5.8 Phase 8: Exit Execution

**Objective**: Close both legs and recover capital.

> **CRITICAL RULE**: Close **spot FIRST**, then **futures**.
> Rationale: Selling spot first converts the asset back to USDT. If futures close fails after spot close, we still have USDT and can retry. If futures closed first but spot sell failed, we'd have unhedged spot exposure.

**Step 8.1: Close spot position (SELL).**

```
SKILL: binance/spot
METHOD: POST
ENDPOINT: /api/v3/order
PARAMETERS:
  symbol: <symbol>
  side: "SELL"
  type: "MARKET"
  quantity: <position.spot_quantity>    # the exact quantity we bought
  newOrderRespType: "RESULT"
SIGNED: yes
```

```python
if response["status"] != "FILLED":
    wait(execution.order_timeout)
    # Re-check order
    if still not filled:
        # Cancel and retry once
        # If retry fails, proceed to futures close anyway (we need to de-risk)
        log("WARNING: Spot sell not filled. Proceeding to close futures. Manual intervention may be needed.")

spot_exit_price = sum(float(f["price"]) * float(f["qty"]) for f in response["fills"]) / float(response["executedQty"])
spot_exit_qty = float(response["executedQty"])
```

**Step 8.2: Close futures position (BUY to close short, reduceOnly).**

```
SKILL: binance-futures
METHOD: POST
ENDPOINT: /fapi/v1/order
PARAMETERS:
  symbol: <symbol>
  side: "BUY"
  type: "MARKET"
  quantity: <position.futures_quantity>
  reduceOnly: "true"
  newOrderRespType: "RESULT"
SIGNED: yes
```

```python
if response["status"] != "FILLED":
    wait(execution.order_timeout)
    # Re-check
    if still not filled:
        log("CRITICAL: Futures close order not filled. Retrying...")
        # Retry up to max_api_retries times
        for attempt in range(execution.max_api_retries):
            wait(execution.api_retry_delay)
            # Retry the same order
            if filled:
                break
        else:
            log("CRITICAL: Unable to close futures position. Manual intervention required.")
            alert_user("Unable to close futures position for {symbol}. Please close manually.")

futures_exit_price = float(response["avgPrice"])
futures_exit_qty = float(response["executedQty"])
```

**Step 8.3: Verify positions are closed.**

```
SKILL: binance-futures
METHOD: GET
ENDPOINT: /fapi/v2/positionRisk
PARAMETERS:
  symbol: <symbol>
SIGNED: yes
```

```python
for pos in response:
    if pos["symbol"] == symbol:
        remaining = abs(float(pos["positionAmt"]))
        if remaining > 0:
            log(f"WARNING: Residual futures position detected: {remaining}")
            # Attempt one more close
```

**Step 8.4: Transfer funds back to spot wallet.**

```
SKILL: binance-wallet
METHOD: POST
ENDPOINT: /sapi/v1/asset/transfer
PARAMETERS:
  type: "UMFUTURE_MAIN"
  asset: "USDT"
  amount: <futures_available_balance>    # transfer everything back
SIGNED: yes
```

Wait 2 seconds, then verify transfer (same as Phase 4, Step 4.2).

**Step 8.5: Record exit data.**

```python
position.spot_exit_price = spot_exit_price
position.futures_exit_price = futures_exit_price
position.exit_timestamp = datetime.utcnow().isoformat()
position.exit_reason = trigger_reason
```

Transition to SETTLING.

### 5.9 Phase 9: Settlement

**Objective**: Calculate final P&L and report to user.

**Step 9.1: Final P&L calculation.**

```python
# === Spot Leg ===
spot_buy_cost = position.spot_entry_price * position.spot_quantity
spot_buy_fee = spot_buy_cost * fees.spot_taker_fee
spot_sell_proceeds = position.spot_exit_price * spot_exit_qty
spot_sell_fee = spot_sell_proceeds * fees.spot_taker_fee
spot_net_pnl = spot_sell_proceeds - spot_buy_cost - spot_buy_fee - spot_sell_fee

# === Futures Leg ===
futures_entry_value = position.futures_entry_price * position.futures_quantity
futures_exit_value = position.futures_exit_price * futures_exit_qty
# For a short: profit = entry_value - exit_value
futures_gross_pnl = futures_entry_value - futures_exit_value
futures_entry_fee = futures_entry_value * fees.futures_taker_fee
futures_exit_fee = futures_exit_value * fees.futures_taker_fee
futures_net_pnl = futures_gross_pnl - futures_entry_fee - futures_exit_fee

# === Funding Income ===
funding_income = position.funding_collected_usdt

# === Total ===
total_fees = spot_buy_fee + spot_sell_fee + futures_entry_fee + futures_exit_fee
total_gross_pnl = spot_net_pnl + futures_net_pnl + funding_income + total_fees  # add back fees for gross
total_net_pnl = spot_net_pnl + futures_net_pnl + funding_income
total_pnl_pct = total_net_pnl / spot_buy_cost if spot_buy_cost > 0 else 0

# === Breakdown ===
settlement = {
    "symbol": position.symbol,
    "entry_time": position.entry_timestamp,
    "exit_time": position.exit_timestamp,
    "exit_reason": position.exit_reason,
    "hold_duration": exit_time - entry_time,
    "funding_periods": position.funding_periods_held,
    "spot_entry_price": position.spot_entry_price,
    "spot_exit_price": position.spot_exit_price,
    "futures_entry_price": position.futures_entry_price,
    "futures_exit_price": position.futures_exit_price,
    "quantity": position.spot_quantity,
    "position_value_usdt": spot_buy_cost,
    "spot_pnl": spot_net_pnl,
    "futures_pnl": futures_net_pnl,
    "funding_income": funding_income,
    "total_fees": total_fees,
    "net_pnl_usdt": total_net_pnl,
    "net_pnl_pct": total_pnl_pct,
    "annualized_return": total_pnl_pct / (hold_duration.total_seconds() / 86400) * 365 if hold_duration.total_seconds() > 0 else 0
}
```

**Step 9.2: Generate exit report.**

See Section 6.3.

**Step 9.3: Send telemetry (if opted in).**

See Section 7.

**Step 9.4: Clean up state.**

```python
persistent_state.active_positions.remove(position)
recently_exited[symbol] = datetime.utcnow()
```

**Step 9.5: Ask user about next action.**

```
Position closed and settled. What would you like to do?
  1. Continue scanning for opportunities
  2. Stop the agent

Please choose [1/2]:
```

If user selects 1, transition to SCANNING. If 2, transition to IDLE.

---

## 6. USER COMMUNICATION PROTOCOLS

### 6.1 Entry Report

Sent in AWAITING_CONF state when presenting an opportunity.

**English:**
```
✅ OPPORTUNITY FOUND — Entry Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Symbol:           {symbol}
Current Price:    ${current_price:,.2f}
Funding Rate:     {funding_rate:.4%} per 8h ({annual_yield:.2%} annualized)
Next Funding:     {next_funding_time} UTC

Position Plan:
  Spot BUY:       {spot_qty} @ ~${current_price:,.2f}
  Futures SHORT:  {futures_qty} @ ~${current_price:,.2f}
  Position Size:  ${position_size_usdt:,.2f} USDT
  Leverage:       {leverage}x

Net Yield Estimate:
  Gross per 8h:   {gross_yield_8h:.4%}
  Round-trip Fees: {total_fee:.4%}
  Basis Cost:     {basis_pct:.4%}
  Net (3 periods): {net_yield:.4%}

Risk Assessment:
  Orderbook Slippage: Spot {spot_slippage:.4%} | Futures {futures_slippage:.4%}
  Margin Ratio:   {margin_ratio:.2%}
  Active Positions: {active_count}/{max_concurrent}

Environment: {environment}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reply CONFIRM to execute, or CANCEL to skip.
```

**Chinese (中文):**
```
✅ 发现套利机会 — 开仓报告
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

交易对:        {symbol}
当前价格:      ${current_price:,.2f}
资金费率:      {funding_rate:.4%} / 8h（年化 {annual_yield:.2%}）
下次结算:      {next_funding_time} UTC

仓位计划:
  现货买入:    {spot_qty} @ ~${current_price:,.2f}
  合约做空:    {futures_qty} @ ~${current_price:,.2f}
  仓位大小:    ${position_size_usdt:,.2f} USDT
  杠杆:        {leverage}x

收益预估:
  每8h毛收益:  {gross_yield_8h:.4%}
  往返手续费:  {total_fee:.4%}
  基差成本:    {basis_pct:.4%}
  净收益(3期): {net_yield:.4%}

风控评估:
  盘口滑点: 现货 {spot_slippage:.4%} | 合约 {futures_slippage:.4%}
  保证金率:    {margin_ratio:.2%}
  活跃仓位:    {active_count}/{max_concurrent}

运行环境: {environment}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
回复 确认 开仓, 或 取消 跳过。
```

### 6.2 Monitoring Report (8h)

Sent after each funding settlement.

**English:**
```
📊 POSITION MONITOR — 8h Funding Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Symbol:          {symbol}
Hold Duration:   {hold_duration}
Funding Period:  #{funding_periods_held}

Current Status:
  Mark Price:    ${mark_price:,.2f}
  Funding Rate:  {current_funding_rate:.4%} per 8h
  Margin Ratio:  {margin_ratio:.2%}

P&L Breakdown:
  Spot P&L:      {spot_pnl_usdt:+,.2f} USDT
  Futures P&L:   {futures_pnl_usdt:+,.2f} USDT
  Funding Recv:  {funding_pnl_usdt:+,.2f} USDT
  Entry Fees:    -{entry_fees_usdt:,.2f} USDT
  ─────────────────────────────
  Combined P&L:  {combined_pnl_usdt:+,.2f} USDT ({combined_pnl_pct:+.2%})

Next Funding:    {next_funding_time} UTC
Status:          {"HOLDING" if no_exit_trigger else "EXIT RECOMMENDED"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Chinese (中文):**
```
📊 持仓监控 — 8h资金费率报告
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

交易对:        {symbol}
持仓时长:      {hold_duration}
资金费期数:    第{funding_periods_held}期

当前状态:
  标记价格:    ${mark_price:,.2f}
  资金费率:    {current_funding_rate:.4%} / 8h
  保证金率:    {margin_ratio:.2%}

盈亏明细:
  现货盈亏:    {spot_pnl_usdt:+,.2f} USDT
  合约盈亏:    {futures_pnl_usdt:+,.2f} USDT
  资金费收入:  {funding_pnl_usdt:+,.2f} USDT
  开仓手续费:  -{entry_fees_usdt:,.2f} USDT
  ─────────────────────────────
  综合盈亏:    {combined_pnl_usdt:+,.2f} USDT ({combined_pnl_pct:+.2%})

下次结算:      {next_funding_time} UTC
状态:          {"持仓中" if no_exit_trigger else "建议平仓"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 6.3 Exit / Settlement Report

Sent after position is fully closed and settled.

**English:**
```
🏁 POSITION CLOSED — Settlement Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Symbol:          {symbol}
Exit Reason:     {exit_reason}
Hold Duration:   {hold_duration}
Funding Periods: {funding_periods}

Prices:
  Entry: Spot ${spot_entry:,.2f} | Futures ${futures_entry:,.2f}
  Exit:  Spot ${spot_exit:,.2f} | Futures ${futures_exit:,.2f}

Position:
  Quantity:      {quantity}
  Value:         ${position_value:,.2f} USDT

P&L Breakdown:
  Spot P&L:      {spot_pnl:+,.2f} USDT
  Futures P&L:   {futures_pnl:+,.2f} USDT
  Funding Income:{funding_income:+,.2f} USDT
  Total Fees:    -{total_fees:,.2f} USDT
  ═════════════════════════════
  NET P&L:       {net_pnl:+,.2f} USDT ({net_pnl_pct:+.2%})
  Annualized:    {annualized:+.2%}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Chinese (中文):**
```
🏁 已平仓 — 结算报告
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

交易对:        {symbol}
平仓原因:      {exit_reason}
持仓时长:      {hold_duration}
资金费期数:    {funding_periods}期

价格:
  开仓: 现货 ${spot_entry:,.2f} | 合约 ${futures_entry:,.2f}
  平仓: 现货 ${spot_exit:,.2f} | 合约 ${futures_exit:,.2f}

仓位:
  数量:        {quantity}
  价值:        ${position_value:,.2f} USDT

盈亏明细:
  现货盈亏:    {spot_pnl:+,.2f} USDT
  合约盈亏:    {futures_pnl:+,.2f} USDT
  资金费收入:  {funding_income:+,.2f} USDT
  总手续费:    -{total_fees:,.2f} USDT
  ═════════════════════════════
  净盈亏:      {net_pnl:+,.2f} USDT ({net_pnl_pct:+.2%})
  年化收益:    {annualized:+.2%}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 6.4 Emergency Alert

**English:**
```
🚨 EMERGENCY ALERT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CRITICAL ISSUE DETECTED:
{reason}

ACTION TAKEN:
{action_description}

Position Status:
  Symbol: {symbol}
  Spot:   {spot_status}
  Futures:{futures_status}

{additional_instructions}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Chinese (中文):**
```
🚨 紧急警报
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

检测到严重问题:
{reason}

已采取措施:
{action_description}

仓位状态:
  交易对: {symbol}
  现货:   {spot_status}
  合约:   {futures_status}

{additional_instructions}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 6.5 Scanning Status (periodic)

Show brief scanning status every 5 scan cycles (to avoid spam):

```
[SCAN #{cycle_number}] Scanned {total_symbols} symbols.
Top rate: {best_symbol} at {best_rate:.4%}/8h.
{status_message}
Next scan: {next_scan_time} UTC.
```

---

## 7. TELEMETRY (OPT-IN)

### 7.1 User Consent

Before enabling telemetry, the agent MUST ask:

```
Would you like to enable anonymous telemetry?

This helps improve the strategy by collecting:
  - Heartbeat signals (session alive, number of positions)
  - Trade outcomes (symbol, P&L %, hold duration, exit reason)

NO personal data, API keys, or account balances are sent.
Data is associated only with your anonymous session ID.

Enable telemetry? [yes/no]:
```

Only set `telemetry.enabled = true` if user explicitly confirms.

### 7.2 Heartbeat

Sent every `telemetry.heartbeat_interval` seconds (default 1800s).

```
POST {telemetry.base_url}/api/telemetry/heartbeat
Content-Type: application/json

{
  "session_id": "<session_id>",
  "timestamp": "<iso8601>",
  "environment": "testnet" | "mainnet",
  "agent_version": "1.0.0",
  "state": "<current_state>",
  "active_positions": <count>,
  "uptime_seconds": <seconds_since_activation>
}
```

Expected response: HTTP 200 with empty body or `{"ok": true}`.
If telemetry call fails, log locally and continue. NEVER let telemetry failures affect strategy operation.

### 7.3 Trade Completion

Sent after each position is settled (Phase 9).

```
POST {telemetry.base_url}/api/telemetry/trade
Content-Type: application/json

{
  "session_id": "<session_id>",
  "timestamp": "<iso8601>",
  "environment": "testnet" | "mainnet",
  "symbol": "<symbol>",
  "position_value_usdt": <float>,
  "net_pnl_pct": <float>,
  "funding_periods_held": <int>,
  "hold_duration_hours": <float>,
  "exit_reason": "<reason_category>",
  "funding_rate_at_entry": <float>,
  "funding_rate_at_exit": <float>
}
```

The `exit_reason` field must be one of:
- `"emergency_margin"`
- `"emergency_liquidation"`
- `"emergency_api_error"`
- `"risk_stop_loss"`
- `"risk_funding_inverted"`
- `"strategy_rate_below_threshold"`
- `"strategy_take_profit"`
- `"strategy_rate_declining"`
- `"manual_user_request"`

### 7.4 Telemetry Privacy Guarantees

- No API keys are ever transmitted.
- No wallet addresses are transmitted.
- No account balances are transmitted.
- Position values are rounded to nearest 100 USDT.
- Session IDs are ephemeral (new per session, not linked to user identity).
- All telemetry is opt-in and can be disabled at any time by the user saying "disable telemetry".

---

## 8. SAFETY RULES (CRITICAL)

These rules are **non-negotiable**. The agent MUST follow them at all times, regardless of user requests.

### Rule 1: ALWAYS Start on Testnet
```
DEFAULT ENVIRONMENT = TESTNET
```
The agent must initialize with `execution.environment = "testnet"` every single time it starts. No exceptions.

### Rule 2: ALWAYS Require Explicit Confirmation for Mainnet
```
IF user requests mainnet:
  Display warning about real funds
  Require EXACT phrase: "CONFIRM MAINNET" or "确认主网"
  Any other input = remain on testnet
```

### Rule 3: NEVER Use Leverage > 1x for Arbitrage
```
ASSERT leverage == 1 BEFORE every futures order
IF leverage != 1:
  DO NOT place order
  Reset leverage to 1
  Retry
  IF still != 1: ABORT and alert user
```
Rationale: Leverage > 1x in an arb strategy increases liquidation risk without increasing funding yield. It transforms a low-risk strategy into a high-risk one.

### Rule 4: NEVER Place Futures Without Immediate Spot Hedge
```
IF futures SHORT is placed:
  Spot BUY MUST follow within inter_leg_delay_ms
  IF spot BUY fails:
    IMMEDIATELY close futures position (reduceOnly BUY)
    NO EXCEPTIONS
```
There must NEVER be a state where a directional futures position exists without the corresponding spot hedge, except during the brief inter-leg delay.

### Rule 5: ALWAYS Check Margin Ratio Before Every Action
```
BEFORE any order placement (entry or exit):
  Fetch margin ratio
  IF margin_ratio > risk.max_margin_ratio:
    DO NOT place new orders
    TRIGGER emergency close for existing positions
```

### Rule 6: IF In Doubt, Close and Alert
```
IF any unexpected state is encountered:
  IF any exception is unhandled:
  IF any API response is unparseable:
  IF any calculation produces NaN or infinity:
  THEN:
    1. Attempt to close all open positions
    2. Transfer all funds to spot wallet
    3. Alert user with full details
    4. Transition to IDLE
    5. DO NOT auto-resume
```

### Rule 7: NEVER Execute on Mainnet Without User in the Loop
```
IF environment == "mainnet":
  ALWAYS require user confirmation for entry
  ALWAYS require user confirmation for non-emergency exit
  NEVER auto-enter positions without user seeing the report
  confirmation_timeout applies (default 300s)
  IF timeout: DO NOT execute. Return to SCANNING.
```

### Rule 8: Respect Rate Limits
```
Binance rate limits:
  Spot: 1200 request weight per minute
  Futures: 2400 request weight per minute

Track request weights. If approaching 80% of limit:
  Slow down scanning/monitoring intervals
  Log a warning

IF rate limited (HTTP 429):
  Back off for the duration specified in Retry-After header
  DO NOT retry immediately
```

### Rule 9: Position Size Hard Caps
```
ABSOLUTE MAXIMUM per position: strategy.max_position_usdt (default 10000 USDT)
ABSOLUTE MAXIMUM total exposure: max_position_usdt * max_concurrent_positions (default 30000 USDT)
User CANNOT override these maximums above 50000 USDT per position or 150000 USDT total.
IF user tries to set higher values:
  Warn: "Position sizes above these limits require manual trading. This agent caps at X USDT for safety."
```

### Rule 10: No Unsupported Operations
```
This agent ONLY performs funding rate arbitrage (spot long + futures short).
It does NOT:
  - Trade directionally (long-only or short-only)
  - Use grid trading, DCA, or other strategies
  - Trade options, leveraged tokens, or other derivatives
  - Withdraw funds from the exchange
  - Modify API key permissions
  - Access any endpoint not listed in this document

IF user asks for unsupported operations:
  Politely decline and explain the agent's scope.
```

---

## 9. ERROR HANDLING & RECOVERY

### 9.1 API Error Categories

| HTTP Code | Category | Action |
|---|---|---|
| 200 | Success | Continue |
| 400 | Bad Request | Log params, fix if possible, otherwise REJECT |
| 401 | Unauthorized | Alert user: "API key issue. Please check credentials." HALT. |
| 403 | Forbidden | Alert user: "API key lacks permissions. Need spot+futures trading." HALT. |
| 404 | Not Found | Symbol may be delisted. Remove from candidates. |
| 418 | IP Ban | CRITICAL: "IP has been auto-banned. Wait and contact support." HALT. |
| 429 | Rate Limited | Back off. Use Retry-After header. |
| 500 | Server Error | Retry up to max_api_retries with exponential backoff. |
| 502/503 | Service Unavailable | Retry with backoff. If persists > 5 min, alert user. |
| -1001 | Disconnected | Retry. Check network. |
| -1021 | Timestamp mismatch | Sync local clock. Retry. |
| -2010 | Insufficient balance | Re-check balances. REJECT if truly insufficient. |
| -2019 | Margin insufficient | Emergency close existing positions if needed. |
| -4046 | No margin type change needed | Ignore (not an error). |

### 9.2 Partial Fill Recovery

**Scenario**: Futures order fills but spot order does not.

```
1. Log: "PARTIAL FILL: Futures SHORT filled {qty} @ {price}. Spot BUY failed."
2. Immediately place futures BUY (reduceOnly) to close the short.
3. IF futures close fills: Log recovery. Transition to REJECT.
4. IF futures close ALSO fails:
   a. Retry 3 times with 2s delay.
   b. IF still failing: Alert user "MANUAL INTERVENTION NEEDED".
   c. Provide exact position details and manual close instructions.
```

**Scenario**: Spot sells but futures close fails.

```
1. Log: "PARTIAL EXIT: Spot SELL filled. Futures BUY close failed."
2. Retry futures close up to 5 times with 3s delays.
3. IF still failing: User alert with manual instructions.
4. NOTE: We now have cash from spot sale + open futures short = directional short exposure.
   This is DANGEROUS. Escalate urgency of alerts.
```

### 9.3 Session Recovery

If the agent session is interrupted while in POSITION_HELD:

```
1. On restart, check persistent_state for active_positions.
2. For each active position:
   a. Verify the position still exists (GET /fapi/v2/positionRisk).
   b. Verify spot balance exists (GET /api/v3/account).
   c. IF both exist: Resume monitoring (transition to POSITION_HELD).
   d. IF futures exists but spot doesn't: EMERGENCY (user may have sold spot manually).
   e. IF spot exists but futures doesn't: EMERGENCY (futures may have been liquidated).
3. Alert user about session recovery with current state.
```

### 9.4 Network Failure Handling

```
IF network is unreachable for > 60 seconds:
  Log "Network connectivity lost. Monitoring paused."
  Retry connection every 10 seconds.
  IF restored within 5 minutes: Resume normal operation.
  IF not restored within 5 minutes: Alert user (if possible via any channel).
  When restored: Immediately check all positions. Run emergency evaluation.
```

---

## 10. GLOSSARY

| Term | Definition |
|---|---|
| **Funding Rate** | A periodic payment between long and short holders of a perpetual futures contract, designed to anchor the futures price to the spot price. |
| **Delta Neutral** | A position where the net exposure to price changes is approximately zero (long spot + short futures). |
| **Basis** | The price difference between the spot market and the futures market for the same asset. |
| **Mark Price** | The fair price of a futures contract, used to calculate unrealized P&L and trigger liquidations. Index price adjusted for basis. |
| **Index Price** | The weighted average spot price across multiple exchanges. |
| **Margin Ratio** | Maintenance margin divided by margin balance. At 100%, liquidation occurs. |
| **Liquidation Price** | The price at which the exchange will forcibly close your futures position to prevent negative balance. |
| **reduceOnly** | An order flag that ensures the order can only reduce an existing position, not open a new one. |
| **USDT-M** | USDT-margined perpetual futures (as opposed to coin-margined). Settled in USDT. |
| **Taker Fee** | Fee charged when you place a market order or a limit order that fills immediately. |
| **Maker Fee** | Fee charged when you place a limit order that adds liquidity to the orderbook. |
| **PnL** | Profit and Loss. |
| **8h Period** | One funding rate period on Binance (00:00, 08:00, 16:00 UTC). |
| **Annualized Return** | The return scaled to a 365-day period for comparison purposes. |
| **Slippage** | The difference between the expected execution price and the actual fill price. |
| **Testnet** | A sandbox environment with fake funds for testing. No real money at risk. |
| **Mainnet** | The live trading environment with real funds. |

---

## APPENDIX A: Quick Start Checklist

For the agent to confirm before first trade:

- [ ] Environment selected (testnet recommended)
- [ ] API keys connected and authenticated
- [ ] Spot account accessible (GET /api/v3/account returns 200)
- [ ] Futures account accessible (GET /fapi/v2/account returns 200)
- [ ] Wallet transfer accessible (POST /sapi/v1/asset/transfer returns 200 or valid error)
- [ ] USDT balance sufficient (>= min_position_usdt in total)
- [ ] Leverage set to 1x confirmed
- [ ] Telemetry preference recorded
- [ ] User understands this is testnet/mainnet
- [ ] First scan initiated

---

## APPENDIX B: Frequently Asked Questions

**Q: Can I run this on multiple symbols simultaneously?**
A: Yes, up to `max_concurrent_positions` (default 3). The agent manages each position independently.

**Q: What happens if I lose internet connection?**
A: Your positions remain open on the exchange. When the agent reconnects, it will resume monitoring. In extreme cases, Binance's liquidation engine protects against infinite losses (at the cost of your margin).

**Q: Can I change parameters while a position is open?**
A: Yes, but changes only affect future decisions. Active positions use the parameters they were opened with, except for emergency thresholds which always use current values.

**Q: Why futures SHORT first, then spot BUY?**
A: If spot buy fails after futures short, we can immediately close the futures (reduceOnly). If we did spot first and futures failed, we'd hold an unhedged long in a potentially falling market with no easy automated reversal.

**Q: Why spot SELL first, then futures CLOSE on exit?**
A: Selling spot converts to USDT immediately. If futures close then fails, we have USDT + open short (a known state we can retry). If futures closed first but spot sell failed, we'd hold an asset that might drop in value.

**Q: What is the minimum capital needed?**
A: `min_position_usdt` (default 100 USDT) across both wallets combined. Realistically, 500+ USDT is recommended to make funding income meaningful after fees.

**Q: Is this truly risk-free?**
A: No. It is LOW risk, not NO risk. Risks include: execution failures, exchange downtime, funding rate reversals, and extreme basis divergence. This strategy assumes both legs execute at similar prices.

---

*End of MASTER_SKILL.md — Funding Rate Arbitrage Agent v1.0.0*
*This document is the complete specification. No external references are required.*
