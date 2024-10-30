pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IIntegration {
    function deposit(uint256 amount) external returns (uint256 shares);

    function withdraw(uint256 shares) external returns (uint256 amount);
}

interface ICurvePool {
    function add_liquidity(
        uint256[] memory _amounts,
        uint256 _min_mint_amount,
        address _receiver
    ) external returns (uint256);

    function remove_liquidity_one_coin(
        uint256 _burn_amount,
        int128 i,
        uint256 _min_received,
        address _receiver
    ) external returns (uint256);
}

interface ICurveGauge {
    function deposit(
        uint256 _value,
        address _user,
        bool _claim_rewards
    ) external;

    function withdraw(uint256 _value, bool _claim_rewards) external;
}

contract CurveIntegration is IIntegration {
    address public curvePoolAddress;
    address public curveGaugeAddress;
    ICurvePool public curvePool;
    ICurveGauge public curveGauge;

    constructor(address _curvePoolAddress, address _curveGaugeAddress) {
        curvePoolAddress = _curvePoolAddress;
        curveGaugeAddress = _curveGaugeAddress;
        curvePool = ICurvePool(curvePoolAddress);
        curveGauge = ICurveGauge(curveGaugeAddress);
    }

    function deposit(
        uint256 amount
    ) external override returns (uint256 shares) {
        uint256[] memory amounts; // Create a dynamic array with 2 elements
        amounts[0] = 0; // Set the first element to 0 for the first coin
        amounts[1] = amount; // Set the second element to `amount` for the second coin

        uint256 minMintAmount = 0; // Set the acceptable minimum for LP tokens
        address receiver = address(this); // The contract itself will receive the LP tokens

        // Step 1: Add liquidity to the Curve pool
        shares = curvePool.add_liquidity(amounts, minMintAmount, receiver);

        // Step 2: Approve the Gauge to spend LP tokens
        IERC20(curvePoolAddress).approve(curveGaugeAddress, shares);

        // Step 3: Deposit LP tokens into Curve Gauge for rewards
        curveGauge.deposit(shares, msg.sender, false);

        return shares;
    }

    function withdraw(
        uint256 shares
    ) external override returns (uint256 amount) {
        // Step 1: Withdraw LP tokens from the Gauge
        curveGauge.withdraw(shares, false);

        // Step 2: Withdraw the second coin from Curve pool
        int128 coinIndex = 1; // Set to 1 for the second coin
        uint256 minReceived = 0; // Minimum amount of coin to receive
        address receiver = msg.sender;

        amount = curvePool.remove_liquidity_one_coin(
            shares,
            coinIndex,
            minReceived,
            receiver
        );

        return amount;
    }
}
