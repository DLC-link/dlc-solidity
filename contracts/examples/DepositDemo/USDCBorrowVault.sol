// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

import 'solmate/src/mixins/ERC4626.sol';
// import '@openzeppelin/contracts/interfaces/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';

import { USDStableCoinForDLCs } from '../LendingDemo/USDC.sol';

// This contract will take DLCBTC deposits and issue shares in exchange
// It will also transfer USDC corresponding to the amount of BTC deposited
contract USDCBorrowVault is ERC4626 {
    using SafeMath for uint256;
    // a mapping that checks if a user has deposited the token
    mapping(address => uint256) public shareHolder;
    mapping(address => uint256) public borrowedAmount;

    IERC20 private _usdc;
    address private _btcPriceFeedAddress;

    constructor(
        ERC20 _asset,
        string memory _name,
        string memory _symbol,
        address _usdcAddress,
        address _priceFeedAddress
    ) ERC4626(_asset, _name, _symbol) {
        _usdc = IERC20(_usdcAddress);
        _btcPriceFeedAddress = _priceFeedAddress;
    }

    function _deposit(uint _assets) public {
        // checks that the deposited amount is greater than zero.
        require(_assets > 0, 'Deposit less than Zero');
        // calling the deposit function from the ERC-4626 library to perform all the necessary functionality
        deposit(_assets, msg.sender);
        // Increase the share of the user
        shareHolder[msg.sender] += _assets;

        (int256 _price, ) = _getLatestPrice(_btcPriceFeedAddress);
        uint256 _amount = SafeMath.mul(
            SafeMath.mul(_assets, uint256(_price)),
            100
        );
        _usdc.transfer(msg.sender, _amount);
        borrowedAmount[msg.sender] += _amount;
    }

    function _withdraw(uint _shares, address _receiver) public {
        // checks that the deposited amount is greater than zero.
        require(_shares > 0, 'withdraw must be greater than Zero');
        // Checks that the _receiver address is not zero.
        require(_receiver != address(0), 'Zero Address');
        // checks that the caller is a shareholder
        require(shareHolder[msg.sender] > 0, 'Not a share holder');
        // checks that the caller has more shares than they are trying to withdraw.
        require(shareHolder[msg.sender] >= _shares, 'Not enough shares');

        // // Calculate 10% yield on the withdrawal amount
        // uint256 percent = (10 * _shares) / 100;
        // // Calculate the total asset amount as the sum of the share amount plus 10% of the share amount.
        // uint256 assets = _shares + percent;
        uint256 assets = _shares;
        // calling the redeem function from the ERC-4626 library to perform all the necessary functionality
        redeem(assets, _receiver, msg.sender);
        // Decrease the share of the user
        shareHolder[msg.sender] -= _shares;

        (int256 _price, ) = _getLatestPrice(_btcPriceFeedAddress);
        uint256 _amount = SafeMath.mul(
            SafeMath.mul(assets, uint256(_price)),
            100
        );
        _usdc.transferFrom(msg.sender, address(this), _amount);
        borrowedAmount[msg.sender] -= _amount;
    }

    // returns total number of assets
    function totalAssets() public view override returns (uint256) {
        return asset.balanceOf(address(this));
    }

    // returns total balance of user
    function totalAssetsOfUser(address _user) public view returns (uint256) {
        return asset.balanceOf(_user);
    }

    function _getLatestPrice(
        address _feedAddress
    ) internal view returns (int256, uint256) {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(_feedAddress);
        (, int256 price, , uint256 timeStamp, ) = priceFeed.latestRoundData();
        return (price, timeStamp);
    }
}
