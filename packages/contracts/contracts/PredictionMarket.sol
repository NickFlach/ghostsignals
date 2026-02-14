// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PredictionMarket
 * @dev On-chain prediction market using simplified LMSR (Logarithmic Market Scoring Rule)
 *
 * LMSR cost function: C(q) = b * ln(Σ exp(qᵢ/b))
 * Price for outcome i: P(i) = exp(qᵢ/b) / Σ exp(qⱼ/b)
 *
 * We use fixed-point math with 18 decimals (WAD) and a lookup table / iterative
 * exp approximation to avoid floating-point. The key insight: we only need the
 * *difference* in cost function values, which is numerically stable when computed
 * via the log-sum-exp trick.
 */
contract PredictionMarket is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ──────────────────── Constants ────────────────────
    uint256 constant WAD = 1e18;
    uint256 constant HALF_WAD = 5e17;
    /// @dev ln(2) * WAD ≈ 0.693147... * 1e18
    uint256 constant LN2_WAD = 693147180559945309;
    /// @dev Maximum exponent input (≈ 130 * WAD) to avoid overflow
    int256 constant MAX_EXP_INPUT = 130e18;
    int256 constant MIN_EXP_INPUT = -42e18;

    // ──────────────────── Market state ────────────────────
    enum MarketState { Active, Paused, Resolved }

    string public question;
    string public description;
    uint256 public numOutcomes;
    string[] public outcomeNames;

    /// @dev LMSR liquidity parameter 'b' (in WAD)
    uint256 public liquidityParameter;
    /// @dev Shares outstanding per outcome (in WAD)
    mapping(uint256 => uint256) public shares;
    /// @dev User share balances: user => outcome => amount
    mapping(address => mapping(uint256 => uint256)) public userShares;

    uint256 public resolutionTime;
    address public oracle;
    address public factory;

    MarketState public state;
    uint256 public winningOutcome;
    bool public liquidityInitialized;

    IERC20 public stablecoin;

    // ──────────────────── Events ────────────────────
    event SharesBought(address indexed buyer, uint256 outcome, uint256 amount, uint256 cost);
    event SharesSold(address indexed seller, uint256 outcome, uint256 amount, uint256 proceeds);
    event MarketResolved(uint256 winningOutcome);
    event LiquidityInitialized(uint256 totalFunding);
    event WinningsClaimed(address indexed user, uint256 amount);

    // ──────────────────── Modifiers ────────────────────
    modifier onlyActive() {
        require(state == MarketState.Active, "Market not active");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracle || msg.sender == factory, "Not oracle/factory");
        _;
    }

    // ──────────────────── Constructor ────────────────────
    constructor(
        string memory _question,
        string memory _description,
        string[] memory _outcomeNames,
        uint256 _liquidityParameter,
        uint256 _resolutionTime,
        address _oracle,
        address _stablecoin,
        address _factory
    ) {
        require(_outcomeNames.length >= 2 && _outcomeNames.length <= 10, "Invalid outcome count");
        require(_liquidityParameter > 0, "Liquidity parameter must be positive");
        require(_resolutionTime > block.timestamp, "Resolution must be in future");

        question = _question;
        description = _description;
        numOutcomes = _outcomeNames.length;
        liquidityParameter = _liquidityParameter;
        resolutionTime = _resolutionTime;
        oracle = _oracle;
        stablecoin = IERC20(_stablecoin);
        factory = _factory;
        state = MarketState.Active;

        for (uint256 i = 0; i < _outcomeNames.length; i++) {
            outcomeNames.push(_outcomeNames[i]);
            // Initialize shares to zero; initializeLiquidity will set them
            shares[i] = 0;
        }
    }

    // ──────────────────── Initialization ────────────────────

    /**
     * @dev Called by MarketFactory after transferring initial liquidity.
     *      Sets equal initial shares so all outcomes start at 1/n.
     */
    function initializeLiquidity() external {
        require(!liquidityInitialized, "Already initialized");
        require(msg.sender == factory, "Only factory");

        uint256 funding = stablecoin.balanceOf(address(this));
        require(funding > 0, "No funding");

        // Set initial shares so each outcome has equal probability.
        // With equal shares s for all outcomes, cost = b * ln(n * exp(s/b)).
        // We set s = 0 for all outcomes (cost function baseline).
        // The initial funding acts as the market maker's subsidy.
        for (uint256 i = 0; i < numOutcomes; i++) {
            shares[i] = 0;
        }

        liquidityInitialized = true;
        emit LiquidityInitialized(funding);
    }

    // ──────────────────── Trading ────────────────────

    /**
     * @dev Buy `amount` shares of `outcome`. Caller pays the LMSR cost delta.
     * @param outcome Index of the outcome (0-based)
     * @param amount Number of shares to buy (WAD)
     * @param maxCost Maximum cost the buyer is willing to pay (slippage protection)
     * @return cost Actual cost charged
     */
    function buyShares(
        uint256 outcome,
        uint256 amount,
        uint256 maxCost
    ) external nonReentrant whenNotPaused onlyActive returns (uint256 cost) {
        require(outcome < numOutcomes, "Invalid outcome");
        require(amount > 0, "Amount must be positive");

        cost = getBuyCost(outcome, amount);
        require(cost <= maxCost, "Cost exceeds max");
        require(cost > 0, "Zero cost");

        // Transfer payment
        stablecoin.safeTransferFrom(msg.sender, address(this), cost);

        // Update state
        shares[outcome] += amount;
        userShares[msg.sender][outcome] += amount;

        emit SharesBought(msg.sender, outcome, amount, cost);
    }

    /**
     * @dev Sell `amount` shares of `outcome`. Caller receives the LMSR cost delta.
     * @param outcome Index of the outcome (0-based)
     * @param amount Number of shares to sell (WAD)
     * @param minProceeds Minimum proceeds the seller will accept (slippage protection)
     * @return proceeds Actual proceeds paid
     */
    function sellShares(
        uint256 outcome,
        uint256 amount,
        uint256 minProceeds
    ) external nonReentrant whenNotPaused onlyActive returns (uint256 proceeds) {
        require(outcome < numOutcomes, "Invalid outcome");
        require(amount > 0, "Amount must be positive");
        require(userShares[msg.sender][outcome] >= amount, "Insufficient shares");

        proceeds = getSellProceeds(outcome, amount);
        require(proceeds >= minProceeds, "Proceeds below min");

        // Update state
        shares[outcome] -= amount;
        userShares[msg.sender][outcome] -= amount;

        // Transfer proceeds
        stablecoin.safeTransfer(msg.sender, proceeds);

        emit SharesSold(msg.sender, outcome, amount, proceeds);
    }

    // ──────────────────── Resolution ────────────────────

    /**
     * @dev Resolve the market with the winning outcome
     */
    function resolve(uint256 _winningOutcome) external onlyOracle {
        require(state == MarketState.Active || state == MarketState.Paused, "Cannot resolve");
        require(_winningOutcome < numOutcomes, "Invalid outcome");

        winningOutcome = _winningOutcome;
        state = MarketState.Resolved;

        emit MarketResolved(_winningOutcome);
    }

    /**
     * @dev Claim winnings after market resolution.
     *      Winning shares pay 1 stablecoin unit per share (WAD-scaled).
     */
    function claimWinnings() external nonReentrant {
        require(state == MarketState.Resolved, "Market not resolved");
        
        uint256 winningShares = userShares[msg.sender][winningOutcome];
        require(winningShares > 0, "No winning shares");

        userShares[msg.sender][winningOutcome] = 0;

        // Each winning share pays 1 unit (WAD). Convert WAD shares to token amount.
        // Assuming stablecoin has same decimals as WAD (18). Adjust if different.
        uint256 payout = winningShares;

        uint256 balance = stablecoin.balanceOf(address(this));
        if (payout > balance) {
            payout = balance; // Safety cap
        }

        stablecoin.safeTransfer(msg.sender, payout);

        emit WinningsClaimed(msg.sender, payout);
    }

    // ──────────────────── Price queries ────────────────────

    /**
     * @dev Get current price (probability) for an outcome
     *      P(i) = exp(qᵢ/b) / Σ exp(qⱼ/b)
     * @return price Price in WAD (0 to 1e18)
     */
    function getCurrentPrice(uint256 outcome) external view returns (uint256 price) {
        require(outcome < numOutcomes, "Invalid outcome");
        return _getCurrentPrice(outcome);
    }

    /**
     * @dev Get prices for all outcomes
     */
    function getAllPrices() external view returns (uint256[] memory prices) {
        prices = new uint256[](numOutcomes);
        for (uint256 i = 0; i < numOutcomes; i++) {
            prices[i] = _getCurrentPrice(i);
        }
    }

    /**
     * @dev Get cost to buy `amount` shares of `outcome`
     *      Cost = C(q + Δq) - C(q)
     */
    function getBuyCost(uint256 outcome, uint256 amount) public view returns (uint256) {
        require(outcome < numOutcomes, "Invalid outcome");

        uint256 costBefore = _costFunction();

        // Temporarily compute cost with increased shares
        uint256 originalShares = shares[outcome];
        // We can't modify state in a view, so we compute inline
        uint256 costAfter = _costFunctionWith(outcome, originalShares + amount);

        require(costAfter >= costBefore, "Math error");
        return costAfter - costBefore;
    }

    /**
     * @dev Get proceeds from selling `amount` shares of `outcome`
     *      Proceeds = C(q) - C(q - Δq)
     */
    function getSellProceeds(uint256 outcome, uint256 amount) public view returns (uint256) {
        require(outcome < numOutcomes, "Invalid outcome");
        require(shares[outcome] >= amount, "Insufficient market shares");

        uint256 costBefore = _costFunction();
        uint256 costAfter = _costFunctionWith(outcome, shares[outcome] - amount);

        require(costBefore >= costAfter, "Math error");
        return costBefore - costAfter;
    }

    // ──────────────────── Admin ────────────────────

    function emergencyPause() external {
        require(msg.sender == factory || msg.sender == owner(), "Not authorized");
        state = MarketState.Paused;
        _pause();
    }

    function emergencyUnpause() external onlyOwner {
        require(state == MarketState.Paused, "Not paused");
        state = MarketState.Active;
        _unpause();
    }

    /**
     * @dev Emergency withdrawal by factory/owner after resolution or in emergency
     */
    function emergencyWithdraw(address to) external onlyOwner {
        uint256 balance = stablecoin.balanceOf(address(this));
        if (balance > 0) {
            stablecoin.safeTransfer(to, balance);
        }
    }

    // ──────────────────── View helpers ────────────────────

    function getOutcomeNames() external view returns (string[] memory) {
        return outcomeNames;
    }

    function getUserShares(address user, uint256 outcome) external view returns (uint256) {
        return userShares[user][outcome];
    }

    function getMarketInfo() external view returns (
        string memory _question,
        uint256 _numOutcomes,
        uint256 _liquidityParameter,
        uint256 _resolutionTime,
        MarketState _state,
        uint256 _winningOutcome,
        uint256 _totalFunding
    ) {
        return (
            question,
            numOutcomes,
            liquidityParameter,
            resolutionTime,
            state,
            winningOutcome,
            stablecoin.balanceOf(address(this))
        );
    }

    // ──────────────────── Internal math ────────────────────

    /**
     * @dev Current price for outcome i: P(i) = exp(qᵢ/b) / Σ exp(qⱼ/b)
     *      Uses log-sum-exp trick for numerical stability:
     *      P(i) = exp((qᵢ - max_q)/b) / Σ exp((qⱼ - max_q)/b)
     */
    function _getCurrentPrice(uint256 outcome) internal view returns (uint256) {
        // Find max shares for numerical stability
        uint256 maxShares = 0;
        for (uint256 i = 0; i < numOutcomes; i++) {
            if (shares[i] > maxShares) maxShares = shares[i];
        }

        // Calculate exp((qᵢ - max)/b) for the target outcome
        int256 scaledTarget = _safeDiv(
            int256(shares[outcome]) - int256(maxShares),
            int256(liquidityParameter)
        );
        uint256 expTarget = _wadExp(scaledTarget);

        // Calculate denominator: Σ exp((qⱼ - max)/b)
        uint256 denominator = 0;
        for (uint256 i = 0; i < numOutcomes; i++) {
            int256 scaled = _safeDiv(
                int256(shares[i]) - int256(maxShares),
                int256(liquidityParameter)
            );
            denominator += _wadExp(scaled);
        }

        if (denominator == 0) return WAD / numOutcomes; // Fallback to uniform

        return (expTarget * WAD) / denominator;
    }

    /**
     * @dev Cost function C(q) = b * ln(Σ exp(qᵢ/b))
     *      Using log-sum-exp: C(q) = b * (max_q/b + ln(Σ exp((qᵢ - max_q)/b)))
     *                               = max_q + b * ln(Σ exp((qᵢ - max_q)/b))
     */
    function _costFunction() internal view returns (uint256) {
        return _costFunctionWith(type(uint256).max, 0); // No override
    }

    /**
     * @dev Cost function with one outcome's shares overridden
     * @param overrideOutcome Outcome to override (type(uint256).max for no override)
     * @param overrideShares New shares value for the overridden outcome
     */
    function _costFunctionWith(
        uint256 overrideOutcome,
        uint256 overrideShares
    ) internal view returns (uint256) {
        // Find max shares for numerical stability
        uint256 maxShares = 0;
        for (uint256 i = 0; i < numOutcomes; i++) {
            uint256 s = (i == overrideOutcome) ? overrideShares : shares[i];
            if (s > maxShares) maxShares = s;
        }

        // Calculate Σ exp((qᵢ - max)/b)
        uint256 sumExp = 0;
        for (uint256 i = 0; i < numOutcomes; i++) {
            uint256 s = (i == overrideOutcome) ? overrideShares : shares[i];
            int256 scaled = _safeDiv(
                int256(s) - int256(maxShares),
                int256(liquidityParameter)
            );
            sumExp += _wadExp(scaled);
        }

        // C = maxShares + b * ln(sumExp)
        // ln(sumExp) where sumExp is in WAD
        uint256 lnSumExp = _wadLn(sumExp);

        // b * ln(sumExp) / WAD + maxShares
        return maxShares + (liquidityParameter * lnSumExp) / WAD;
    }

    // ──────────────────── Fixed-point math ────────────────────

    /**
     * @dev Safe division for signed integers, returning WAD-scaled result
     */
    function _safeDiv(int256 a, int256 b) internal pure returns (int256) {
        require(b != 0, "Division by zero");
        return (a * int256(WAD)) / b;
    }

    /**
     * @dev WAD-scaled exponential: exp(x) where x is in WAD
     *      Uses the identity: exp(x) = 2^(x / ln(2))
     *      Then decomposes into integer and fractional parts of the base-2 exponent.
     *
     *      For the fractional part, uses a 6th-order Taylor series around 0:
     *      exp(f) ≈ 1 + f + f²/2 + f³/6 + f⁴/24 + f⁵/120 + f⁶/720
     *
     *      Accuracy: < 0.001% error for |x| < 20
     */
    function _wadExp(int256 x) internal pure returns (uint256) {
        // Clamp to avoid overflow
        if (x >= MAX_EXP_INPUT) return type(uint256).max / WAD; // Very large
        if (x <= MIN_EXP_INPUT) return 0; // Effectively zero

        // Handle zero
        if (x == 0) return WAD;

        // Negative exponents: exp(-|x|) = 1/exp(|x|)
        bool isNegative = x < 0;
        uint256 absX = isNegative ? uint256(-x) : uint256(x);

        // Decompose: x / ln(2) = intPart + fracPart
        // intPart = floor(absX / LN2_WAD)
        uint256 intPart = absX / LN2_WAD;
        uint256 fracPartX = absX - (intPart * LN2_WAD); // Remainder in original scale

        // fracPartX is now in [0, ln(2)) scaled by WAD
        // Compute exp(fracPartX) via Taylor series
        uint256 fracExp = _taylorExp(fracPartX);

        // exp(absX) = 2^intPart * exp(fracPartX)
        uint256 result;
        if (intPart >= 255) {
            // Overflow protection
            return isNegative ? 0 : type(uint256).max / WAD;
        }

        if (intPart == 0) {
            result = fracExp;
        } else {
            // 2^intPart * fracExp / WAD (fracExp is WAD-scaled)
            result = fracExp << intPart;
        }

        if (isNegative) {
            // exp(-x) = WAD² / exp(x)
            if (result == 0) return type(uint256).max; // Shouldn't happen with clamping
            return (WAD * WAD) / result;
        }

        return result;
    }

    /**
     * @dev Taylor series for exp(x) where x is in [0, ln(2)) WAD-scaled
     *      exp(x) ≈ 1 + x + x²/2 + x³/6 + x⁴/24 + x⁵/120 + x⁶/720
     */
    function _taylorExp(uint256 x) internal pure returns (uint256) {
        if (x == 0) return WAD;

        uint256 term = WAD; // term_0 = 1
        uint256 sum = WAD;  // sum starts at 1

        // term_1 = x
        term = (term * x) / WAD;
        sum += term;

        // term_2 = x²/2
        term = (term * x) / (WAD * 2);
        sum += term;

        // term_3 = x³/6
        term = (term * x) / (WAD * 3);
        sum += term;

        // term_4 = x⁴/24
        term = (term * x) / (WAD * 4);
        sum += term;

        // term_5 = x⁵/120
        term = (term * x) / (WAD * 5);
        sum += term;

        // term_6 = x⁶/720
        term = (term * x) / (WAD * 6);
        sum += term;

        return sum;
    }

    /**
     * @dev WAD-scaled natural logarithm: ln(x) where x is in WAD
     *      Uses the identity: ln(x) = log2(x) * ln(2)
     *      And decomposes log2 into integer + fractional parts.
     *
     *      For the fractional part (x in [1,2)), uses a Padé approximant:
     *      ln(x) ≈ 2 * (x-1)/(x+1) * (1 + ((x-1)/(x+1))²/3 + ((x-1)/(x+1))⁴/5)
     */
    function _wadLn(uint256 x) internal pure returns (uint256) {
        require(x > 0, "ln(0) undefined");

        if (x == WAD) return 0;

        // Find integer part of log2: how many times we can divide by 2
        uint256 intLog2 = 0;
        uint256 normalized = x;

        // Scale up if x < WAD
        if (normalized < WAD) {
            // For x < 1, ln(x) < 0. But in our usage, sumExp >= WAD always
            // (since at least one exp term is 1). Handle gracefully.
            return 0; // ln(x) for x < 1 would be negative; return 0 as floor
        }

        // Find integer log2
        while (normalized >= 2 * WAD) {
            normalized /= 2;
            intLog2++;
        }

        // Now normalized is in [WAD, 2*WAD)
        // Calculate fractional ln using series expansion
        // Let y = (normalized - WAD) / (normalized + WAD)  (in WAD)
        uint256 num = normalized - WAD;
        uint256 den = normalized + WAD;
        uint256 y = (num * WAD) / den;

        // ln(normalized/WAD) ≈ 2*y * (1 + y²/3 + y⁴/5 + y⁶/7)
        uint256 y2 = (y * y) / WAD;
        uint256 y4 = (y2 * y2) / WAD;
        uint256 y6 = (y4 * y2) / WAD;

        // series = 1 + y²/3 + y⁴/5 + y⁶/7
        uint256 series = WAD + (y2 * WAD) / (3 * WAD) + (y4 * WAD) / (5 * WAD) + (y6 * WAD) / (7 * WAD);

        // fracLn = 2 * y * series / WAD
        uint256 fracLn = (2 * y * series) / WAD;

        // Total: intLog2 * ln(2) + fracLn
        return (intLog2 * LN2_WAD) + fracLn;
    }
}
