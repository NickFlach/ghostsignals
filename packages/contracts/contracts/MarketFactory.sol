// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./PredictionMarket.sol";

/**
 * @title MarketFactory
 * @dev Factory contract for deploying new prediction markets
 * Manages market creation, validation, and global market registry
 */
contract MarketFactory is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Market categories
    enum MarketCategory {
        FOOD,
        HOUSING,
        ENERGY,
        HEALTHCARE,
        TRANSPORT,
        TECH,
        MATERIALS
    }

    // Market regions
    enum MarketRegion {
        US_NORTHEAST,
        US_SOUTHEAST,
        US_MIDWEST,
        US_WEST,
        US_SOUTHWEST,
        EU_NORTH,
        EU_SOUTH,
        EU_CENTRAL,
        ASIA_EAST,
        ASIA_SOUTHEAST,
        GLOBAL
    }

    struct MarketConfig {
        string question;
        string description;
        MarketCategory category;
        MarketRegion region;
        string[] outcomeNames;
        uint256 liquidityParameter; // LMSR 'b' parameter
        uint256 initialLiquidity; // Initial funding in wei
        uint256 resolutionTime; // Unix timestamp
        address oracle; // Price oracle address
    }

    // Events
    event MarketCreated(
        address indexed marketAddress,
        string question,
        MarketCategory category,
        MarketRegion region,
        address creator
    );

    event MarketResolved(
        address indexed marketAddress,
        uint256 winningOutcome
    );

    // State variables
    address[] public markets;
    mapping(address => bool) public isValidMarket;
    mapping(address => uint256) public marketIndex;
    mapping(MarketCategory => address[]) public marketsByCategory;
    mapping(MarketRegion => address[]) public marketsByRegion;
    
    // Configuration
    uint256 public minLiquidityParameter = 100 ether;
    uint256 public maxLiquidityParameter = 10000 ether;
    uint256 public minInitialLiquidity = 1000 ether;
    uint256 public marketCreationFee = 0.01 ether;
    address public feeCollector;
    IERC20 public stablecoin; // USDC or similar

    // Oracle management
    mapping(address => bool) public approvedOracles;

    constructor(address _stablecoin, address _feeCollector) {
        stablecoin = IERC20(_stablecoin);
        feeCollector = _feeCollector;
    }

    /**
     * @dev Create a new prediction market
     */
    function createMarket(
        MarketConfig calldata config
    ) external payable nonReentrant returns (address) {
        require(msg.value >= marketCreationFee, "Insufficient creation fee");
        require(config.outcomeNames.length >= 2, "Need at least 2 outcomes");
        require(config.outcomeNames.length <= 10, "Too many outcomes");
        require(config.liquidityParameter >= minLiquidityParameter, "Liquidity parameter too low");
        require(config.liquidityParameter <= maxLiquidityParameter, "Liquidity parameter too high");
        require(config.initialLiquidity >= minInitialLiquidity, "Initial liquidity too low");
        require(config.resolutionTime > block.timestamp, "Resolution time must be in future");
        require(approvedOracles[config.oracle], "Oracle not approved");

        // Transfer initial liquidity from creator
        stablecoin.safeTransferFrom(msg.sender, address(this), config.initialLiquidity);

        // Deploy new market contract
        PredictionMarket market = new PredictionMarket(
            config.question,
            config.description,
            config.outcomeNames,
            config.liquidityParameter,
            config.resolutionTime,
            config.oracle,
            address(stablecoin),
            address(this)
        );

        // Fund the market with initial liquidity
        stablecoin.safeTransfer(address(market), config.initialLiquidity);
        market.initializeLiquidity();

        // Register the market
        address marketAddress = address(market);
        markets.push(marketAddress);
        isValidMarket[marketAddress] = true;
        marketIndex[marketAddress] = markets.length - 1;
        marketsByCategory[config.category].push(marketAddress);
        marketsByRegion[config.region].push(marketAddress);

        // Transfer creation fee to collector
        payable(feeCollector).transfer(msg.value);

        emit MarketCreated(
            marketAddress,
            config.question,
            config.category,
            config.region,
            msg.sender
        );

        return marketAddress;
    }

    /**
     * @dev Resolve a market (called by oracle)
     */
    function resolveMarket(
        address marketAddress,
        uint256 winningOutcome
    ) external {
        require(isValidMarket[marketAddress], "Invalid market");
        
        PredictionMarket market = PredictionMarket(marketAddress);
        require(msg.sender == market.oracle(), "Only oracle can resolve");
        
        market.resolve(winningOutcome);
        
        emit MarketResolved(marketAddress, winningOutcome);
    }

    /**
     * @dev Get all markets
     */
    function getAllMarkets() external view returns (address[] memory) {
        return markets;
    }

    /**
     * @dev Get markets by category
     */
    function getMarketsByCategory(
        MarketCategory category
    ) external view returns (address[] memory) {
        return marketsByCategory[category];
    }

    /**
     * @dev Get markets by region
     */
    function getMarketsByRegion(
        MarketRegion region
    ) external view returns (address[] memory) {
        return marketsByRegion[region];
    }

    /**
     * @dev Get total number of markets
     */
    function getMarketCount() external view returns (uint256) {
        return markets.length;
    }

    // Admin functions
    function setMarketCreationFee(uint256 _fee) external onlyOwner {
        marketCreationFee = _fee;
    }

    function setFeeCollector(address _collector) external onlyOwner {
        feeCollector = _collector;
    }

    function setLiquidityLimits(
        uint256 _minParam,
        uint256 _maxParam,
        uint256 _minLiquidity
    ) external onlyOwner {
        minLiquidityParameter = _minParam;
        maxLiquidityParameter = _maxParam;
        minInitialLiquidity = _minLiquidity;
    }

    function approveOracle(address oracle, bool approved) external onlyOwner {
        approvedOracles[oracle] = approved;
    }

    function setStablecoin(address _stablecoin) external onlyOwner {
        stablecoin = IERC20(_stablecoin);
    }

    // Emergency functions
    function emergencyPause(address marketAddress) external onlyOwner {
        require(isValidMarket[marketAddress], "Invalid market");
        PredictionMarket(marketAddress).emergencyPause();
    }

    function emergencyWithdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }
}