// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./PredictionMarket.sol";
import "./MarketFactory.sol";

/**
 * @title HedgeVault
 * @dev Manages user hedging positions and automated rebalancing
 * Holds collateral and manages positions across multiple prediction markets
 */
contract HedgeVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Position {
        address market;
        uint256 outcome;
        uint256 shares;
        uint256 costBasis;
        uint256 timestamp;
    }

    struct HedgingBasket {
        Position[] positions;
        uint256 totalValue;
        uint256 totalCost;
        uint256 lastRebalance;
        bool isActive;
    }

    struct RebalanceParams {
        address market;
        uint256 outcome;
        int256 sharesDelta; // Positive = buy, negative = sell
        uint256 maxSlippage; // Basis points (10000 = 100%)
    }

    // Events
    event BasketCreated(address indexed user, uint256 basketId);
    event PositionUpdated(
        address indexed user,
        uint256 basketId,
        address market,
        uint256 outcome,
        int256 sharesDelta
    );
    event BasketRebalanced(
        address indexed user,
        uint256 basketId,
        uint256 timestamp
    );
    event CollateralDeposited(address indexed user, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);

    // State variables
    mapping(address => uint256[]) public userBaskets;
    mapping(address => HedgingBasket) public baskets; // basketId -> basket
    mapping(address => uint256) public userCollateral;
    mapping(address => uint256) public basketCounter;

    IERC20 public stablecoin;
    MarketFactory public marketFactory;
    
    // Configuration
    uint256 public minBasketValue = 100 ether; // Minimum $100 basket
    uint256 public maxPositionsPerBasket = 20;
    uint256 public rebalanceThreshold = 500; // 5% in basis points
    uint256 public managementFee = 100; // 1% annual fee in basis points
    uint256 constant BASIS_POINTS = 10000;

    // Fee collection
    address public feeCollector;
    mapping(address => uint256) public lastFeeCollection;

    constructor(
        address _stablecoin,
        address _marketFactory,
        address _feeCollector
    ) {
        stablecoin = IERC20(_stablecoin);
        marketFactory = MarketFactory(_marketFactory);
        feeCollector = _feeCollector;
    }

    /**
     * @dev Deposit collateral for hedging
     */
    function depositCollateral(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be positive");
        
        stablecoin.safeTransferFrom(msg.sender, address(this), amount);
        userCollateral[msg.sender] += amount;
        
        emit CollateralDeposited(msg.sender, amount);
    }

    /**
     * @dev Withdraw available collateral
     */
    function withdrawCollateral(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be positive");
        require(userCollateral[msg.sender] >= amount, "Insufficient collateral");
        
        // Check if withdrawal would leave insufficient collateral for positions
        uint256 requiredCollateral = calculateRequiredCollateral(msg.sender);
        require(
            userCollateral[msg.sender] - amount >= requiredCollateral,
            "Would undercollateralize positions"
        );
        
        userCollateral[msg.sender] -= amount;
        stablecoin.safeTransfer(msg.sender, amount);
        
        emit CollateralWithdrawn(msg.sender, amount);
    }

    /**
     * @dev Create a new hedging basket
     */
    function createBasket() external returns (uint256) {
        require(userCollateral[msg.sender] >= minBasketValue, "Insufficient collateral");
        
        uint256 basketId = uint256(keccak256(abi.encodePacked(
            msg.sender,
            basketCounter[msg.sender]++,
            block.timestamp
        )));
        
        HedgingBasket storage basket = baskets[basketId];
        basket.isActive = true;
        basket.lastRebalance = block.timestamp;
        
        userBaskets[msg.sender].push(basketId);
        
        emit BasketCreated(msg.sender, basketId);
        return basketId;
    }

    /**
     * @dev Execute basket rebalancing
     */
    function rebalanceBasket(
        uint256 basketId,
        RebalanceParams[] calldata params
    ) external nonReentrant {
        require(isBasketOwner(msg.sender, basketId), "Not basket owner");
        
        HedgingBasket storage basket = baskets[basketId];
        require(basket.isActive, "Basket not active");
        
        // Collect management fee before rebalancing
        collectManagementFee(msg.sender);
        
        uint256 totalCostDelta = 0;
        
        for (uint256 i = 0; i < params.length; i++) {
            RebalanceParams calldata param = params[i];
            
            require(
                marketFactory.isValidMarket(param.market),
                "Invalid market"
            );
            
            if (param.sharesDelta > 0) {
                // Buy shares
                uint256 cost = buyShares(
                    basketId,
                    param.market,
                    param.outcome,
                    uint256(param.sharesDelta),
                    param.maxSlippage
                );
                totalCostDelta += cost;
                
            } else if (param.sharesDelta < 0) {
                // Sell shares
                uint256 proceeds = sellShares(
                    basketId,
                    param.market,
                    param.outcome,
                    uint256(-param.sharesDelta),
                    param.maxSlippage
                );
                totalCostDelta -= proceeds;
            }
            
            emit PositionUpdated(
                msg.sender,
                basketId,
                param.market,
                param.outcome,
                param.sharesDelta
            );
        }
        
        // Update basket totals
        basket.totalCost = totalCostDelta > basket.totalCost 
            ? 0 
            : basket.totalCost - totalCostDelta;
        basket.totalValue = calculateBasketValue(basketId);
        basket.lastRebalance = block.timestamp;
        
        emit BasketRebalanced(msg.sender, basketId, block.timestamp);
    }

    /**
     * @dev Calculate current basket value
     */
    function calculateBasketValue(uint256 basketId) public view returns (uint256) {
        HedgingBasket storage basket = baskets[basketId];
        uint256 totalValue = 0;
        
        for (uint256 i = 0; i < basket.positions.length; i++) {
            Position storage position = basket.positions[i];
            
            if (position.shares > 0) {
                PredictionMarket market = PredictionMarket(position.market);
                uint256 currentPrice = market.getCurrentPrice(position.outcome);
                totalValue += (position.shares * currentPrice) / 1 ether;
            }
        }
        
        return totalValue;
    }

    /**
     * @dev Get user's baskets
     */
    function getUserBaskets(address user) external view returns (uint256[] memory) {
        return userBaskets[user];
    }

    /**
     * @dev Get basket details
     */
    function getBasket(uint256 basketId) external view returns (
        Position[] memory positions,
        uint256 totalValue,
        uint256 totalCost,
        uint256 lastRebalance,
        bool isActive
    ) {
        HedgingBasket storage basket = baskets[basketId];
        return (
            basket.positions,
            basket.totalValue,
            basket.totalCost,
            basket.lastRebalance,
            basket.isActive
        );
    }

    /**
     * @dev Calculate stability score for a basket
     */
    function calculateStabilityScore(uint256 basketId) external view returns (uint256) {
        // Simplified stability calculation
        // In practice, would calculate hedging effectiveness based on user's expense profile
        HedgingBasket storage basket = baskets[basketId];
        
        if (basket.positions.length == 0) return 0;
        
        // Higher diversification = higher stability
        uint256 diversificationScore = (basket.positions.length * 1000) / maxPositionsPerBasket;
        
        // Recent rebalancing = higher stability
        uint256 rebalanceScore = block.timestamp - basket.lastRebalance > 30 days ? 500 : 1000;
        
        return (diversificationScore + rebalanceScore) / 2;
    }

    // Internal functions
    function buyShares(
        uint256 basketId,
        address market,
        uint256 outcome,
        uint256 shares,
        uint256 maxSlippage
    ) internal returns (uint256 cost) {
        PredictionMarket predictionMarket = PredictionMarket(market);
        
        // Get quote
        uint256 quotedCost = predictionMarket.getBuyCost(outcome, shares);
        
        // Execute trade
        stablecoin.safeApprove(market, quotedCost);
        cost = predictionMarket.buyShares(outcome, shares, quotedCost + (quotedCost * maxSlippage / BASIS_POINTS));
        
        // Update position
        updatePosition(basketId, market, outcome, int256(shares), cost);
        
        return cost;
    }

    function sellShares(
        uint256 basketId,
        address market,
        uint256 outcome,
        uint256 shares,
        uint256 maxSlippage
    ) internal returns (uint256 proceeds) {
        PredictionMarket predictionMarket = PredictionMarket(market);
        
        // Get quote
        uint256 quotedProceeds = predictionMarket.getSellProceeds(outcome, shares);
        
        // Execute trade
        proceeds = predictionMarket.sellShares(
            outcome, 
            shares, 
            quotedProceeds - (quotedProceeds * maxSlippage / BASIS_POINTS)
        );
        
        // Update position
        updatePosition(basketId, market, outcome, -int256(shares), 0);
        
        return proceeds;
    }

    function updatePosition(
        uint256 basketId,
        address market,
        uint256 outcome,
        int256 sharesDelta,
        uint256 costDelta
    ) internal {
        HedgingBasket storage basket = baskets[basketId];
        
        // Find existing position
        int256 positionIndex = -1;
        for (uint256 i = 0; i < basket.positions.length; i++) {
            if (basket.positions[i].market == market && 
                basket.positions[i].outcome == outcome) {
                positionIndex = int256(i);
                break;
            }
        }
        
        if (positionIndex >= 0) {
            // Update existing position
            Position storage position = basket.positions[uint256(positionIndex)];
            
            if (sharesDelta > 0) {
                position.shares += uint256(sharesDelta);
                position.costBasis += costDelta;
            } else {
                uint256 sharesToRemove = uint256(-sharesDelta);
                if (sharesToRemove >= position.shares) {
                    // Remove position entirely
                    removePosition(basketId, uint256(positionIndex));
                } else {
                    position.shares -= sharesToRemove;
                    // Proportionally reduce cost basis
                    position.costBasis = (position.costBasis * position.shares) / 
                                       (position.shares + sharesToRemove);
                }
            }
        } else if (sharesDelta > 0) {
            // Create new position
            require(basket.positions.length < maxPositionsPerBasket, "Too many positions");
            
            basket.positions.push(Position({
                market: market,
                outcome: outcome,
                shares: uint256(sharesDelta),
                costBasis: costDelta,
                timestamp: block.timestamp
            }));
        }
    }

    function removePosition(uint256 basketId, uint256 positionIndex) internal {
        HedgingBasket storage basket = baskets[basketId];
        
        // Move last position to the deleted position's place
        basket.positions[positionIndex] = basket.positions[basket.positions.length - 1];
        basket.positions.pop();
    }

    function isBasketOwner(address user, uint256 basketId) internal view returns (bool) {
        uint256[] storage userBasketIds = userBaskets[user];
        for (uint256 i = 0; i < userBasketIds.length; i++) {
            if (userBasketIds[i] == basketId) {
                return true;
            }
        }
        return false;
    }

    function calculateRequiredCollateral(address user) internal view returns (uint256) {
        // Calculate minimum collateral needed for all user positions
        uint256[] storage basketIds = userBaskets[user];
        uint256 totalRequired = 0;
        
        for (uint256 i = 0; i < basketIds.length; i++) {
            HedgingBasket storage basket = baskets[basketIds[i]];
            if (basket.isActive) {
                totalRequired += basket.totalCost; // Simplified: use cost basis
            }
        }
        
        return totalRequired;
    }

    function collectManagementFee(address user) internal {
        uint256 lastCollection = lastFeeCollection[user];
        if (lastCollection == 0) lastCollection = block.timestamp;
        
        uint256 timeElapsed = block.timestamp - lastCollection;
        if (timeElapsed < 30 days) return; // Only collect monthly
        
        uint256 userValue = calculateUserTotalValue(user);
        uint256 annualFee = (userValue * managementFee) / BASIS_POINTS;
        uint256 fee = (annualFee * timeElapsed) / 365 days;
        
        if (fee > 0 && userCollateral[user] >= fee) {
            userCollateral[user] -= fee;
            stablecoin.safeTransfer(feeCollector, fee);
            lastFeeCollection[user] = block.timestamp;
        }
    }

    function calculateUserTotalValue(address user) internal view returns (uint256) {
        uint256[] storage basketIds = userBaskets[user];
        uint256 totalValue = 0;
        
        for (uint256 i = 0; i < basketIds.length; i++) {
            if (baskets[basketIds[i]].isActive) {
                totalValue += calculateBasketValue(basketIds[i]);
            }
        }
        
        return totalValue;
    }

    // Admin functions
    function setMinBasketValue(uint256 _minValue) external onlyOwner {
        minBasketValue = _minValue;
    }

    function setMaxPositions(uint256 _maxPositions) external onlyOwner {
        maxPositionsPerBasket = _maxPositions;
    }

    function setManagementFee(uint256 _fee) external onlyOwner {
        require(_fee <= 500, "Fee too high"); // Max 5%
        managementFee = _fee;
    }

    function setFeeCollector(address _collector) external onlyOwner {
        feeCollector = _collector;
    }

    function emergencyWithdraw() external onlyOwner {
        uint256 balance = stablecoin.balanceOf(address(this));
        stablecoin.safeTransfer(owner(), balance);
    }
}