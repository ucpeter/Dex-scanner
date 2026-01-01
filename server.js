// server.js - Real-time DEX Arbitrage Scanner Backend
// Deploy this on Render as a Node.js Web Service

const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from 'public' directory
app.use(express.static('public'));

// Environment variables (set these in Render dashboard)
const PORT = process.env.PORT || 3001;
const NETWORKS = {
  ethereum: {
    rpc: process.env.ETHEREUM_RPC || 'https://eth.llamarpc.com',
    chainId: 1,
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapV3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e'
  },
  polygon: {
    rpc: process.env.POLYGON_RPC || 'https://polygon-rpc.com',
    chainId: 137,
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapV3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e'
  },
  arbitrum: {
    rpc: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
    chainId: 42161,
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapV3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e'
  },
  optimism: {
    rpc: process.env.OPTIMISM_RPC || 'https://mainnet.optimism.io',
    chainId: 10,
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapV3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e'
  },
  base: {
    rpc: process.env.BASE_RPC || 'https://mainnet.base.org',
    chainId: 8453,
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapV3Factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    quoterV2: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a'
  },
  bsc: {
    rpc: process.env.BSC_RPC || 'https://bsc-dataseed.binance.org',
    chainId: 56,
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapV3Factory: '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7',
    quoterV2: '0x78D78E420Da98ad378D7799bE8f4AF69033EB077'
  }
};

// Trading pairs to monitor
const TRADING_PAIRS = [
  { token0: 'WETH', token1: 'USDC', token0Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', token1Address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals0: 18, decimals1: 6 },
  { token0: 'WETH', token1: 'USDT', token0Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', token1Address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals0: 18, decimals1: 6 },
  { token0: 'WBTC', token1: 'WETH', token0Address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 8, decimals1: 18 },
];

// Uniswap V3 Quoter ABI (simplified)
const QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
];

// Get Uniswap V3 price
async function getUniswapV3Price(network, pair, amountIn) {
  try {
    const provider = new ethers.JsonRpcProvider(network.rpc);
    const quoter = new ethers.Contract(network.quoterV2, QUOTER_ABI, provider);
    
    // Try different fee tiers (3000 = 0.3%, 500 = 0.05%, 10000 = 1%)
    const feeTiers = [3000, 500, 10000];
    let bestQuote = null;
    let bestAmountOut = ethers.BigNumber.from(0);

    for (const fee of feeTiers) {
      try {
        const params = {
          tokenIn: pair.token0Address,
          tokenOut: pair.token1Address,
          amountIn: ethers.parseUnits(amountIn.toString(), pair.decimals0),
          fee: fee,
          sqrtPriceLimitX96: 0
        };

        const result = await quoter.quoteExactInputSingle.staticCall(params);
        const amountOut = result[0];

        if (amountOut.gt(bestAmountOut)) {
          bestAmountOut = amountOut;
          bestQuote = {
            amountOut: ethers.formatUnits(amountOut, pair.decimals1),
            fee: fee
          };
        }
      } catch (err) {
        // Pool doesn't exist for this fee tier, continue
        continue;
      }
    }

    return bestQuote;
  } catch (error) {
    console.error('Uniswap V3 quote error:', error.message);
    return null;
  }
}

// Get Paraswap price
async function getParaswapPrice(network, pair, amountIn) {
  try {
    const amount = ethers.parseUnits(amountIn.toString(), pair.decimals0).toString();
    
    const url = `${network.paraswapAPI}/prices`;
    const params = {
      srcToken: pair.token0Address,
      destToken: pair.token1Address,
      amount: amount,
      srcDecimals: pair.decimals0,
      destDecimals: pair.decimals1,
      network: network.chainId,
      side: 'SELL'
    };

    const response = await axios.get(url, { 
      params,
      timeout: 5000 
    });

    if (response.data && response.data.priceRoute) {
      return {
        amountOut: ethers.formatUnits(response.data.priceRoute.destAmount, pair.decimals1),
        dex: response.data.priceRoute.bestRoute?.[0]?.swaps?.[0]?.swapExchanges?.[0]?.exchange || 'Paraswap'
      };
    }

    return null;
  } catch (error) {
    console.error('Paraswap quote error:', error.message);
    return null;
  }
}

// Scan for arbitrage opportunities
async function scanArbitrage(networkKey) {
  const network = NETWORKS[networkKey];
  const opportunities = [];
  const tradeSize = 1; // Trade 1 unit of token0

  for (const pair of TRADING_PAIRS) {
    try {
      // Get prices from both DEXes in parallel
      const [uniswapQuote, paraswapQuote] = await Promise.all([
        getUniswapV3Price(network, pair, tradeSize),
        getParaswapPrice(network, pair, tradeSize)
      ]);

      if (!uniswapQuote || !paraswapQuote) {
        continue;
      }

      const uniswapPrice = parseFloat(uniswapQuote.amountOut);
      const paraswapPrice = parseFloat(paraswapQuote.amountOut);

      // Calculate arbitrage opportunity
      let buyDex, sellDex, buyPrice, sellPrice;

      if (uniswapPrice > paraswapPrice) {
        // Buy on Paraswap, sell on Uniswap
        buyDex = 'Paraswap V5';
        sellDex = 'Uniswap V3';
        buyPrice = paraswapPrice;
        sellPrice = uniswapPrice;
      } else {
        // Buy on Uniswap, sell on Paraswap
        buyDex = 'Uniswap V3';
        sellDex = 'Paraswap V5';
        buyPrice = uniswapPrice;
        sellPrice = paraswapPrice;
      }

      const profitPercent = ((sellPrice - buyPrice) / buyPrice) * 100;

      // Only include opportunities with >0.5% profit
      if (profitPercent > 0.5) {
        opportunities.push({
          network: networkKey,
          chainId: network.chainId,
          pair: `${pair.token0}/${pair.token1}`,
          buyDex,
          sellDex,
          buyPrice: buyPrice.toFixed(6),
          sellPrice: sellPrice.toFixed(6),
          profitPercent: profitPercent.toFixed(3),
          timestamp: new Date().toISOString(),
          tradeSize: tradeSize
        });
      }
    } catch (error) {
      console.error(`Error scanning ${pair.token0}/${pair.token1}:`, error.message);
    }
  }

  return opportunities;
}

// API endpoint to scan for opportunities
app.get('/api/scan/:network', async (req, res) => {
  const { network } = req.params;

  if (!NETWORKS[network]) {
    return res.status(400).json({ error: 'Invalid network' });
  }

  try {
    const opportunities = await scanArbitrage(network);
    res.json({
      success: true,
      network,
      opportunities,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get available networks
app.get('/api/networks', (req, res) => {
  res.json({
    networks: Object.keys(NETWORKS).map(key => ({
      id: key,
      name: key.charAt(0).toUpperCase() + key.slice(1),
      chainId: NETWORKS[key].chainId
    }))
  });
});

// Serve frontend at root
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, () => {
  console.log(`🚀 DEX Arbitrage Scanner running on port ${PORT}`);
  console.log(`📊 Monitoring ${Object.keys(NETWORKS).length} networks`);
  console.log(`💱 Tracking ${TRADING_PAIRS.length} trading pairs`);
});

module.exports = app;
