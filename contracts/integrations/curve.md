# CurveIntegration Deposit Flow

## Initial State

-   PoolMerchant has dlcBTC tokens
-   PoolMerchant approves CurveIntegration to spend dlcBTC

## Step 1: Add Liquidity to Pool

```solidity
// Prepare amounts array for curve pool (e.g., for a 2-token pool)
uint256[] memory amounts = new uint256[](2);
amounts[uint256(uint128(dlcBTCIndex))] = amount;
// If dlcBTC is the second token (index 1), this means:
// amounts = [0, amount]

// Approve curve pool to spend our dlcBTC
IERC20(dlcBTC).approve(curvePoolAddress, amount);

// Add liquidity to pool
// Returns LP tokens representing our share of the pool
shares = curvePool.add_liquidity(amounts, 0, address(this));
```

## Step 2: Deposit LP Tokens to Gauge

```solidity
// Approve gauge to spend LP tokens
IERC20(curvePoolAddress).approve(curveGaugeAddress, shares);

// Deposit LP tokens into gauge
// This is what enables us to earn CRV rewards
curveGauge.deposit(shares, address(this));
```

## Flow of Tokens

1. dlcBTC: PoolMerchant -> CurveIntegration -> Curve Pool
2. LP Tokens: Curve Pool -> CurveIntegration -> Curve Gauge

## Results

-   Our dlcBTC is in the Curve Pool
-   Our LP tokens are in the Curve Gauge
-   We'll earn CRV rewards based on our gauge deposit
-   The shares returned represent our proportional ownership of the pool

## Key Points

-   All token movements require prior approvals
-   We use minMintAmount = 0 (no slippage protection currently)
-   We keep LP tokens in the gauge to earn rewards
-   Our shares accounting in PoolMerchant matches the LP tokens we have in the gauge

# CurveIntegration Withdraw Flow

## Initial State

-   Our LP tokens are in the Curve Gauge
-   We want to get back dlcBTC
-   PoolMerchant calls withdraw with the number of shares (LP tokens) to withdraw

## Step 1: Withdraw from Gauge

```solidity
// Withdraw LP tokens from gauge
// claim_rewards = true means we'll also get any pending CRV rewards
curveGauge.withdraw(shares, true);
```

## Step 2: Remove Liquidity from Pool

```solidity
// Remove liquidity for a single coin (dlcBTC)
amount = curvePool.remove_liquidity_one_coin(
    shares,             // amount of LP tokens to burn
    dlcBTCIndex,        // index of token we want back (dlcBTC)
    0,                  // minimum amount to accept
    msg.sender          // recipient (PoolMerchant)
);
```

## Flow of Tokens

1. LP Tokens: Curve Gauge -> CurveIntegration -> Curve Pool
2. dlcBTC: Curve Pool -> PoolMerchant

## Results

-   We get back dlcBTC tokens
-   Our LP tokens are burned
-   We may receive any accrued CRV rewards
-   The `amount` returned is how many dlcBTC tokens we received

## Key Points

-   No approvals needed for withdrawals
-   We use minReceived = 0 (no slippage protection currently)
-   We might get fewer dlcBTC back than we put in due to:
    -   Pool fees
    -   Price changes
    -   Slippage
-   Using remove_liquidity_one_coin is more gas efficient than remove_liquidity
-   Any pending rewards are claimed automatically if claim_rewards = true

## Notes on Accounting

-   PoolMerchant updates its accounting based on the returned amount:

```solidity
_vaults[uuid].integrationShares[integration] -= withdrawAmount;
_vaults[uuid].totalAllocated -= received;
integ.totalShares -= withdrawAmount;
```
