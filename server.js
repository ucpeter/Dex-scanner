// server.js - FIXED VERSION with proper ethers.js v6 configuration
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3001;

// NETWORK CONFIGURATION - SIMPLIFIED
const NETWORKS = {
  polygon: {
    rpc: process.env.POLYGON_RPC || 'https://polygon.llamarpc.com',
    chainId: 137,
    name: 'polygon',
    quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    aaveLendingPool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD'
  },
  arbitrum: {
    rpc: process.env.ARBITRUM_RPC || 'https://arbitrum.llamarpc.com',
    chainId: 42161,
    name: 'arbitrum',
    quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    aaveLendingPool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD'
  },
  base: {
    rpc: process.env.BASE_RPC || 'https://base.llamarpc.com',
    chainId: 8453,
    name: 'base',
    quoterV2: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    aaveLendingPool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5'
  },
  ethereum: {
    rpc: process.env.ETHEREUM_RPC || 'https://eth.llamarpc.com',
    chainId: 1,
    name: 'mainnet',
    quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    aaveLendingPool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2'
  },
  optimism: {
    rpc: process.env.OPTIMISM_RPC || 'https://optimism.llamarpc.com',
    chainId: 10,
    name: 'optimism',
    quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    aaveLendingPool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD'
  }
};

// SIMPLIFIED TOKEN PAIRS - Focus on HIGHEST LIQUIDITY
const TRADING_PAIRS = {
  polygon: [
    { token0: 'WETH', token1: 'USDC', token0Address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', token1Address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals0: 18, decimals1: 6 },
    { token0: 'WMATIC', token1: 'USDC', token0Address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', token1Address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals0: 18, decimals1: 6 },
    { token0: 'USDC', token1: 'USDT', token0Address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', token1Address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals0: 6, decimals1: 6 },
  ],
  arbitrum: [
    { token0: 'WETH', token1: 'USDC', token0Address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', token1Address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', decimals0: 18, decimals1: 6 },
    { token0: 'ARB', token1: 'WETH', token0Address: '0x912CE59144191C1204E64559FE8253a0e49E6548', token1Address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals0: 18, decimals1: 18 },
  ],
  base: [
    { token0: 'WETH', token1: 'USDC', token0Address: '0x4200000000000000000000000000000000000006', token1Address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals0: 18, decimals1: 6 },
    { token0: 'DEGEN', token1: 'WETH', token0Address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', token1Address: '0x4200000000000000000000000000000000000006', decimals0: 18, decimals1: 18 },
  ],
  ethereum: [
    { token0: 'WETH', token1: 'USDC', token0Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', token1Address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals0: 18, decimals1: 6 },
    { token0: 'USDC', token1: 'USDT', token0Address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', token1Address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals0: 6, decimals1: 6 },
  ],
  optimism: [
    { token0: 'WETH', token1: 'USDC', token0Address: '0x4200000000000000000000000000000000000006', token1Address: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', decimals0: 18, decimals1: 6 },
    { token0: 'OP', token1: 'WETH', token0Address: '0x4200000000000000000000000000000000000042', token1Address: '0x4200000000000000000000000000000000000006', decimals0: 18, decimals1: 18 },
  ]
};

// Uniswap V3 Quoter ABI
const QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
];

// FIXED: Create provider with proper configuration
function createProvider(networkConfig) {
  try {
    // SIMPLEST approach - just use RPC URL
    return new ethers.JsonRpcProvider(networkConfig.rpc);
  } catch (error) {
    console.error(`Failed to create provider for ${networkConfig.name}:`, error.message);
    throw error;
  }
}

// Get Uniswap V3 prices for all fee tiers
async function getUniswapV3Prices(networkConfig, pair, amountIn) {
  try {
    const provider = createProvider(networkConfig);
    const quoter = new ethers.Contract(networkConfig.quoterV2, QUOTER_ABI, provider);
    
    const feeTiers = [
      { fee: 500, name: '0.05%' },
      { fee: 3000, name: '0.3%' },
      { fee: 10000, name: '1%' }
    ];
    
    const prices = [];
    const amountInWei = ethers.parseUnits(amountIn.toString(), pair.decimals0);
    
    for (const tier of feeTiers) {
      try {
        const result = await quoter.quoteExactInputSingle.staticCall({
          tokenIn: pair.token0Address,
          tokenOut: pair.token1Address,
          amountIn: amountInWei,
          fee: tier.fee,
          sqrtPriceLimitX96: 0
        });
        
        const amountOut = ethers.formatUnits(result[0], pair.decimals1);
        prices.push({
          fee: tier.fee,
          feeName: tier.name,
          amountOut: amountOut,
          price: parseFloat(amountOut),
          success: true
        });
        
        console.log(`      ${tier.name}: ${amountOut} ${pair.token1}`);
      } catch (error) {
        // Pool doesn't exist for this fee tier - skip
        continue;
      }
    }
    
    return prices.sort((a, b) => a.price - b.price);
  } catch (error) {
    console.log(`    ❌ Uniswap error: ${error.message}`);
    return [];
  }
}

// Find arbitrage opportunities
async function scanNetwork(networkKey) {
  const networkConfig = NETWORKS[networkKey];
  const pairs = TRADING_PAIRS[networkKey];
  const opportunities = [];
  
  // Adjust trade size
  const tradeSize = networkKey === 'ethereum' ? 0.1 : 1; // Smaller amounts for testing
  
  console.log(`\n🔍 Scanning ${pairs.length} pairs on ${networkKey}...`);
  
  for (const pair of pairs) {
    try {
      console.log(`  Checking ${pair.token0}/${pair.token1}...`);
      
      const prices = await getUniswapV3Prices(networkConfig, pair, tradeSize);
      
      if (prices.length < 2) {
        console.log(`    ⚠️  Need at least 2 pools for arbitrage (found ${prices.length})`);
        continue;
      }
      
      // Check for price differences
      const cheapest = prices[0];
      const expensive = prices[prices.length - 1];
      const profitPercent = ((expensive.price - cheapest.price) / cheapest.price) * 100;
      
      console.log(`    Price spread: ${profitPercent.toFixed(3)}%`);
      
      if (profitPercent > 0.2) { // 0.2% threshold
        console.log(`    ✅ ARBITRAGE FOUND: ${profitPercent.toFixed(3)}% profit!`);
        
        // Calculate profit
        const tradeSizeUSD = networkKey === 'ethereum' ? 200 : 2000;
        const grossProfit = (tradeSizeUSD * profitPercent / 100).toFixed(2);
        const gasCost = networkKey === 'ethereum' ? '30-50' : '0.5-2';
        const flashloanFee = (tradeSizeUSD * 0.0009).toFixed(2);
        
        opportunities.push({
          network: networkKey,
          pair: `${pair.token0}/${pair.token1}`,
          buyFrom: `Uniswap V3 (${cheapest.feeName})`,
          sellTo: `Uniswap V3 (${expensive.feeName})`,
          buyPrice: cheapest.price.toFixed(6),
          sellPrice: expensive.price.toFixed(6),
          profitPercent: profitPercent.toFixed(3),
          tradeSize: `${tradeSize} ${pair.token0}`,
          
          furucomboStrategy: {
            steps: [
              `1. Flashloan ${tradeSize} ${pair.token0} from Aave V3`,
              `2. Swap at ${cheapest.feeName} pool → ${expensive.price.toFixed(2)} ${pair.token1}`,
              `3. Swap at ${expensive.feeName} pool → ${(parseFloat(cheapest.price) + parseFloat(cheapest.price) * profitPercent/100).toFixed(2)} ${pair.token0}`,
              `4. Repay flashloan + 0.09% fee`
            ],
            estimatedGas: `$${gasCost} USD`,
            estimatedProfit: `$${grossProfit} USD gross`,
            netProfit: `$${(parseFloat(grossProfit) - parseFloat(flashloanFee) - 1).toFixed(2)} USD net`
          }
        });
      }
      
    } catch (error) {
      console.log(`    ❌ Error: ${error.message}`);
    }
  }
  
  return opportunities;
}

// API Endpoints
app.get('/api/scan/:network', async (req, res) => {
  const { network } = req.params;
  
  if (!NETWORKS[network]) {
    return res.status(400).json({ 
      error: `Network not supported. Try: ${Object.keys(NETWORKS).join(', ')}` 
    });
  }
  
  try {
    const opportunities = await scanNetwork(network);
    
    res.json({
      success: true,
      network,
      opportunities,
      count: opportunities.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      suggestion: 'Check RPC endpoint configuration' 
    });
  }
});

// Test endpoint
app.get('/api/test/:network', async (req, res) => {
  const { network } = req.params;
  
  if (!NETWORKS[network]) {
    return res.status(400).json({ error: 'Invalid network' });
  }
  
  const networkConfig = NETWORKS[network];
  const pair = TRADING_PAIRS[network][0]; // First pair
  
  console.log(`\n🧪 Testing ${network}: ${pair.token0}/${pair.token1}`);
  
  try {
    const prices = await getUniswapV3Prices(networkConfig, pair, 1);
    
    res.json({
      success: true,
      network,
      pair: `${pair.token0}/${pair.token1}`,
      poolsFound: prices.length,
      pools: prices,
      test: 'Uniswap V3 contract call successful'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      debug: 'Check if RPC endpoint is working' 
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'DEX Arbitrage Scanner',
    version: '3.0',
    networks: Object.keys(NETWORKS)
  });
});

// Quick scan
app.get('/api/quick', async (req, res) => {
  try {
    // Always test Polygon first (most reliable)
    const opportunities = await scanNetwork('polygon');
    
    res.json({
      status: 'ok',
      network: 'polygon',
      opportunities: opportunities.slice(0, 3), // Return only first 3
      total: opportunities.length,
      note: 'Testing Polygon network (most reliable)'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      error: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 DEX Arbitrage Scanner running on port ${PORT}`);
  console.log(`📊 Supported networks: ${Object.keys(NETWORKS).join(', ')}`);
  console.log(`\n📍 Test endpoints:`);
  console.log(`   → Health:   http://localhost:${PORT}/health`);
  console.log(`   → Quick:    http://localhost:${PORT}/api/quick`);
  console.log(`   → Polygon:  http://localhost:${PORT}/api/scan/polygon`);
  console.log(`   → Test:     http://localhost:${PORT}/api/test/polygon`);
});

module.exports = app;
