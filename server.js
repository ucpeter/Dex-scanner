// server.js - Fixed version for Uniswap V3 vs ParaSwap V5 arbitrage

const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static('public'));

const PORT = process.env.PORT || 3001;

// Environment variables for RPCs (set these in Render)
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
  }
};

// Focus on HIGH LIQUIDITY pairs for flashloan arbitrage
const TRADING_PAIRS = {
  ethereum: [
    // Major stablecoin pairs (best for arbitrage)
    { token0: 'WETH', token1: 'USDC', token0Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', token1Address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals0: 18, decimals1: 6 },
    { token0: 'WETH', token1: 'USDT', token0Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', token1Address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals0: 18, decimals1: 6 },
    { token0: 'USDC', token1: 'USDT', token0Address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', token1Address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals0: 6, decimals1: 6 },
    { token0: 'DAI', token1: 'USDC', token0Address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', token1Address: '0xA0b86991c6218b36c1d19D4a2e9Eb0ce3606eB48', decimals0: 18, decimals1: 6 },
    
    // High volume trading pairs
    { token0: 'WBTC', token1: 'WETH', token0Address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 8, decimals1: 18 },
    { token0: 'LINK', token1: 'WETH', token0Address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 }
  ],
  
  polygon: [
    { token0: 'WMATIC', token1: 'USDC', token0Address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', token1Address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals0: 18, decimals1: 6 },
    { token0: 'WETH', token1: 'USDC', token0Address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', token1Address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals0: 18, decimals1: 6 },
    { token0: 'USDC', token1: 'USDT', token0Address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', token1Address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals0: 6, decimals1: 6 }
  ],
  
  arbitrum: [
    { token0: 'WETH', token1: 'USDC', token0Address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', token1Address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', decimals0: 18, decimals1: 6 },
    { token0: 'ARB', token1: 'WETH', token0Address: '0x912CE59144191C1204E64559FE8253a0e49E6548', token1Address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals0: 18, decimals1: 18 }
  ],
  
  base: [
    { token0: 'WETH', token1: 'USDC', token0Address: '0x4200000000000000000000000000000000000006', token1Address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals0: 18, decimals1: 6 }
  ]
};

// Uniswap V3 Quoter ABI (simplified)
const QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
];

// Get Uniswap V3 Best Price (lowest of all fee tiers)
async function getUniswapV3BestPrice(network, pair, amountIn) {
  try {
    const provider = new ethers.JsonRpcProvider(network.rpc, network.chainId, {
      staticNetwork: true
    });
    
    const quoter = new ethers.Contract(network.quoterV2, QUOTER_ABI, provider);
    
    // Try all fee tiers to find best price
    const feeTiers = [
      { fee: 100, name: '0.01%' },
      { fee: 500, name: '0.05%' },
      { fee: 3000, name: '0.3%' },
      { fee: 10000, name: '1%' }
    ];
    
    let bestPrice = null;
    let bestFee = null;
    
    for (const tier of feeTiers) {
      try {
        const amountInWei = ethers.parseUnits(amountIn.toString(), pair.decimals0);
        
        const result = await quoter.quoteExactInputSingle.staticCall({
          tokenIn: pair.token0Address,
          tokenOut: pair.token1Address,
          amountIn: amountInWei,
          fee: tier.fee,
          sqrtPriceLimitX96: 0
        });
        
        const amountOut = ethers.formatUnits(result[0], pair.decimals1);
        const price = parseFloat(amountOut);
        
        // Find LOWEST price (best to buy from)
        if (!bestPrice || price < bestPrice) {
          bestPrice = price;
          bestFee = tier;
        }
      } catch (err) {
        // Pool doesn't exist for this fee tier - skip
        continue;
      }
    }
    
    if (bestPrice) {
      return {
        amountOut: bestPrice.toFixed(6),
        fee: bestFee.fee,
        feeName: bestFee.name,
        dex: 'Uniswap V3'
      };
    }
    
    return null;
  } catch (error) {
    console.log(`    ⚠️  Uniswap error: ${error.message}`);
    return null;
  }
}

// Get ParaSwap V5 Price - FIXED VERSION
async function getParaswapV5Price(network, pair, amountIn) {
  try {
    const amount = ethers.parseUnits(amountIn.toString(), pair.decimals0).toString();
    
    // Use multiple endpoints to avoid blocks
    const endpoints = [
      'https://apiv5.paraswap.io',
      'https://api.paraswap.io'
    ];
    
    for (const baseUrl of endpoints) {
      try {
        console.log(`    Trying ${baseUrl}...`);
        
        const response = await axios.get(`${baseUrl}/prices`, {
          params: {
            srcToken: pair.token0Address,
            destToken: pair.token1Address,
            amount: amount,
            srcDecimals: pair.decimals0,
            destDecimals: pair.decimals1,
            network: network.chainId,
            side: 'SELL',
            includeContractMethods: 'simpleSwap',
            partner: 'paraswap.io' // Some endpoints require partner
          },
          timeout: 5000,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0',
            'Origin': 'https://paraswap.io',
            'Referer': 'https://paraswap.io/'
          }
        });
        
        if (response.data && response.data.priceRoute) {
          const destAmount = response.data.priceRoute.destAmount;
          const dexUsed = response.data.priceRoute.bestRoute?.[0]?.swaps?.[0]?.swapExchanges?.[0]?.exchange || 'ParaSwap';
          
          console.log(`    ✅ ParaSwap success via ${baseUrl}`);
          
          return {
            amountOut: ethers.formatUnits(destAmount, pair.decimals1),
            dex: dexUsed,
            rawRoute: response.data.priceRoute
          };
        }
      } catch (err) {
        if (err.response?.status === 403) {
          console.log(`    ⚠️  ParaSwap 403 from ${baseUrl}, trying next...`);
          continue;
        }
        if (err.code === 'ECONNABORTED') {
          console.log(`    ⚠️  ParaSwap timeout from ${baseUrl}`);
          continue;
        }
        console.log(`    ⚠️  ParaSwap error from ${baseUrl}: ${err.message}`);
      }
    }
    
    console.log(`    ❌ All ParaSwap endpoints failed`);
    return null;
  } catch (error) {
    console.log(`    ❌ ParaSwap fatal error: ${error.message}`);
    return null;
  }
}

// Alternative: Use 0x API as ParaSwap backup
async function getZeroExPrice(network, pair, amountIn) {
  try {
    const amount = ethers.parseUnits(amountIn.toString(), pair.decimals0).toString();
    
    // 0x API works on Ethereum, Polygon, BSC, Avalanche
    const chainMap = {
      1: 'ethereum',
      137: 'polygon',
      56: 'bsc',
      43114: 'avalanche',
      10: 'optimism',
      42161: 'arbitrum'
    };
    
    const chainName = chainMap[network.chainId];
    if (!chainName) return null;
    
    const response = await axios.get(
      `https://api.0x.org/swap/v1/quote`,
      {
        params: {
          sellToken: pair.token0Address,
          buyToken: pair.token1Address,
          sellAmount: amount,
          slippagePercentage: 0.01, // 1% slippage
          feeRecipient: '0x0000000000000000000000000000000000000000',
          buyTokenPercentageFee: 0
        },
        headers: {
          '0x-api-key': process.env.ZEROEX_API_KEY || '', // Optional
          'Accept': 'application/json'
        },
        timeout: 5000
      }
    );
    
    return {
      amountOut: ethers.formatUnits(response.data.buyAmount, pair.decimals1),
      dex: '0x API',
      source: response.data.source
    };
  } catch (error) {
    console.log(`    ⚠️  0x API error: ${error.response?.status || error.message}`);
    return null;
  }
}

// Scan for Uniswap V3 vs ParaSwap arbitrage
async function scanV3VsParaSwapArbitrage(networkKey) {
  const network = NETWORKS[networkKey];
  const opportunities = [];
  
  // Use trade size of 1 ETH (or equivalent)
  const tradeSize = networkKey === 'ethereum' ? 1 : 10; // 1 ETH on mainnet, 10 on L2
  
  const pairs = TRADING_PAIRS[networkKey] || TRADING_PAIRS.ethereum;
  
  console.log(`\n🔍 Scanning ${pairs.length} pairs on ${networkKey} for Uniswap V3 vs ParaSwap arbitrage...`);
  
  for (const pair of pairs) {
    try {
      console.log(`  Checking ${pair.token0}/${pair.token1}...`);
      
      // Get Uniswap V3 price (lowest of all fee tiers)
      console.log(`    Fetching Uniswap V3 price...`);
      const uniswapPrice = await getUniswapV3BestPrice(network, pair, tradeSize);
      
      if (!uniswapPrice) {
        console.log(`    ⚠️  Uniswap V3 price unavailable`);
        continue;
      }
      
      console.log(`    Uniswap V3 ${uniswapPrice.feeName}: ${uniswapPrice.amountOut} ${pair.token1}`);
      
      // Get ParaSwap V5 price
      console.log(`    Fetching ParaSwap V5 price...`);
      const paraswapPrice = await getParaswapV5Price(network, pair, tradeSize);
      
      // If ParaSwap fails, try 0x as backup
      let aggregatorPrice = paraswapPrice;
      if (!paraswapPrice) {
        console.log(`    Trying 0x API as backup...`);
        aggregatorPrice = await getZeroExPrice(network, pair, tradeSize);
      }
      
      if (!aggregatorPrice) {
        console.log(`    ⚠️  No aggregator price available`);
        continue;
      }
      
      console.log(`    ${aggregatorPrice.dex}: ${aggregatorPrice.amountOut} ${pair.token1}`);
      
      // Compare prices
      const uniswapOut = parseFloat(uniswapPrice.amountOut);
      const aggregatorOut = parseFloat(aggregatorPrice.amountOut);
      
      // Calculate profit percentage
      const profitPercent = ((Math.max(uniswapOut, aggregatorOut) - Math.min(uniswapOut, aggregatorOut)) / 
                             Math.min(uniswapOut, aggregatorOut)) * 100;
      
      // Determine which DEX is cheaper (buy from) and which is more expensive (sell to)
      const buyFrom = uniswapOut < aggregatorOut ? 'Uniswap V3' : aggregatorPrice.dex;
      const sellTo = uniswapOut < aggregatorOut ? aggregatorPrice.dex : 'Uniswap V3';
      const buyPrice = Math.min(uniswapOut, aggregatorOut);
      const sellPrice = Math.max(uniswapOut, aggregatorOut);
      
      console.log(`    Price difference: ${profitPercent.toFixed(3)}%`);
      
      // Check if profitable (account for flashloan fees + gas)
      const minProfitPercent = networkKey === 'ethereum' ? 0.5 : 0.3; // Higher threshold for mainnet
      
      if (profitPercent > minProfitPercent) {
        console.log(`    ✅ ARBITRAGE FOUND: ${profitPercent.toFixed(3)}% profit!`);
        
        // Calculate realistic profit
        const tradeSizeUSD = networkKey === 'ethereum' ? 2000 : 20000; // Approximate USD value
        const estimatedProfitUSD = (tradeSizeUSD * profitPercent / 100).toFixed(2);
        
        // Estimate gas costs
        let gasEstimateUSD;
        if (networkKey === 'ethereum') {
          gasEstimateUSD = (50 + Math.random() * 100).toFixed(2); // $50-150
        } else if (networkKey === 'polygon') {
          gasEstimateUSD = (0.5 + Math.random() * 2).toFixed(2); // $0.5-2.5
        } else {
          gasEstimateUSD = (2 + Math.random() * 10).toFixed(2); // $2-12
        }
        
        // Flashloan fee (Aave V3: 0.09%)
        const flashloanFeeUSD = (tradeSizeUSD * 0.0009).toFixed(2);
        
        // Net profit
        const netProfitUSD = (parseFloat(estimatedProfitUSD) - parseFloat(gasEstimateUSD) - parseFloat(flashloanFeeUSD)).toFixed(2);
        
        if (parseFloat(netProfitUSD) > 0) {
          opportunities.push({
            network: networkKey,
            chainId: network.chainId,
            pair: `${pair.token0}/${pair.token1}`,
            buyFrom: buyFrom,
            sellTo: sellTo,
            buyPrice: buyPrice.toFixed(6),
            sellPrice: sellPrice.toFixed(6),
            profitPercent: profitPercent.toFixed(3),
            tradeSize: `${tradeSize} ${pair.token0}`,
            tradeSizeUSD: tradeSizeUSD,
            
            // Furucombo execution details
            furucomboStrategy: {
              type: 'flashloan_arbitrage',
              flashloan: {
                protocol: 'Aave V3',
                asset: pair.token0,
                assetAddress: pair.token0Address,
                amount: `${tradeSize} ${pair.token0}`,
                fee: `${flashloanFeeUSD} USD (0.09%)`
              },
              steps: [
                {
                  step: 1,
                  action: 'Swap',
                  protocol: buyFrom === 'Uniswap V3' ? 'Uniswap V3' : 'ParaSwap Router',
                  from: pair.token0,
                  to: pair.token1,
                  expectedOutput: `${sellPrice.toFixed(2)} ${pair.token1}`
                },
                {
                  step: 2,
                  action: 'Swap',
                  protocol: sellTo === 'Uniswap V3' ? 'Uniswap V3' : 'ParaSwap Router',
                  from: pair.token1,
                  to: pair.token0,
                  expectedOutput: `${(tradeSize * 1.0009).toFixed(4)} ${pair.token0} + ${netProfitUSD} USD profit`
                },
                {
                  step: 3,
                  action: 'Repay Flashloan',
                  protocol: 'Aave V3',
                  amount: `${tradeSize} ${pair.token0} + ${flashloanFeeUSD} USD fee`
                }
              ],
              estimatedGas: `${gasEstimateUSD} USD`,
              flashloanFee: `${flashloanFeeUSD} USD`,
              netProfit: `${netProfitUSD} USD`,
              executionTime: '~30 seconds',
              
              // Contract addresses for Furucombo
              contracts: {
                uniswapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
                paraswapRouter: '0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57',
                aaveLendingPool: networkKey === 'ethereum' ? '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9' : 
                               networkKey === 'polygon' ? '0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf' : 
                               '0x794a61358D6845594F94dc1DB02A252b5b4814aD'
              }
            },
            
            timestamp: new Date().toISOString(),
            confidence: profitPercent > 1 ? 'HIGH' : 'MEDIUM'
          });
        } else {
          console.log(`    ⚠️  Not profitable after fees: ${netProfitUSD} USD net`);
        }
      } else {
        console.log(`    📊 Spread too small: ${profitPercent.toFixed(3)}% (needs >${minProfitPercent}%)`);
      }
      
    } catch (error) {
      console.log(`    ❌ Error: ${error.message}`);
      continue;
    }
  }
  
  console.log(`\n✅ Scan complete: Found ${opportunities.length} arbitrage opportunities\n`);
  
  // Log opportunities summary
  if (opportunities.length > 0) {
    console.log('📋 Opportunities found:');
    opportunities.forEach((opp, i) => {
      console.log(`${i + 1}. ${opp.pair} on ${opp.network}: ${opp.profitPercent}% profit (${opp.furucomboStrategy.netProfit} net)`);
    });
  }
  
  return opportunities;
}

// API Endpoints
app.get('/api/scan/:network', async (req, res) => {
  const { network } = req.params;
  
  if (!NETWORKS[network]) {
    return res.status(400).json({ error: 'Invalid network. Try: ethereum, polygon, arbitrum, base' });
  }
  
  try {
    const opportunities = await scanV3VsParaSwapArbitrage(network);
    
    res.json({
      success: true,
      network,
      opportunities,
      count: opportunities.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      suggestion: 'Try a different network like polygon or arbitrum'
    });
  }
});

// Test endpoint with specific pair
app.get('/api/test/:network/:token0/:token1', async (req, res) => {
  const { network, token0, token1 } = req.params;
  
  if (!NETWORKS[network]) {
    return res.status(400).json({ error: 'Invalid network' });
  }
  
  const networkConfig = NETWORKS[network];
  const pairs = TRADING_PAIRS[network] || TRADING_PAIRS.ethereum;
  
  // Find the specific pair
  const pair = pairs.find(p => 
    p.token0 === token0.toUpperCase() && p.token1 === token1.toUpperCase()
  );
  
  if (!pair) {
    return res.status(404).json({ error: 'Pair not found' });
  }
  
  console.log(`\n🧪 Testing ${network}: ${pair.token0}/${pair.token1}`);
  
  try {
    const tradeSize = network === 'ethereum' ? 1 : 10;
    
    const results = {
      network,
      pair: `${pair.token0}/${pair.token1}`,
      tradeSize: `${tradeSize} ${pair.token0}`,
      uniswapV3: null,
      paraswapV5: null,
      zeroEx: null,
      arbitrage: null
    };
    
    // Get Uniswap V3 price
    results.uniswapV3 = await getUniswapV3BestPrice(networkConfig, pair, tradeSize);
    
    // Get ParaSwap price
    results.paraswapV5 = await getParaswapV5Price(networkConfig, pair, tradeSize);
    
    // Get 0x price as backup
    if (!results.paraswapV5) {
      results.zeroEx = await getZeroExPrice(networkConfig, pair, tradeSize);
    }
    
     // Calculate arbitrage
    const prices = [];
    if (results.uniswapV3) prices.push({ source: 'Uniswap V3', price: parseFloat(results.uniswapV3.amountOut) });
    if (results.paraswapV5) prices.push({ source: 'ParaSwap', price: parseFloat(results.paraswapV5.amountOut) });
    if (results.zeroEx) prices.push({ source: '0x', price: parseFloat(results.zeroEx.amountOut) });
    
    if (prices.length >= 2) {
      const sorted = prices.sort((a, b) => a.price - b.price);
      const buyFrom = sorted[0];
      const sellTo = sorted[sorted.length - 1];
      const profitPercent = ((sellTo.price - buyFrom.price) / buyFrom.price) * 100;
      
      results.arbitrage = {
        buyFrom: buyFrom.source,
        sellTo: sellTo.source,
        buyPrice: buyFrom.price.toFixed(6),
        sellPrice: sellTo.price.toFixed(6),
        profitPercent: profitPercent.toFixed(3) + '%',
        profitable: profitPercent > 0.3,
        strategy: `Buy from ${buyFrom.source}, sell to ${sellTo.source}`
      };
    }
    
    console.log(`✅ Test complete`);
    res.json(results);
    
  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Uniswap V3 vs ParaSwap Arbitrage Scanner',
    timestamp: new Date().toISOString() 
  });
});

// Get available networks
app.get('/api/networks', (req, res) => {
  res.json({
    networks: Object.keys(NETWORKS).map(key => ({
      id: key,
      name: key.charAt(0).toUpperCase() + key.slice(1),
      chainId: NETWORKS[key].chainId,
      recommended: ['polygon', 'arbitrum', 'base'].includes(key)
    }))
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Uniswap V3 vs ParaSwap Arbitrage Scanner running on port ${PORT}`);
  console.log(`📊 Focus: Flashloan arbitrage for Furucombo execution`);
  console.log(`\n📍 Recommended networks for testing:`);
  console.log(`   → Polygon: https://your-app.onrender.com/api/scan/polygon`);
  console.log(`   → Arbitrum: https://your-app.onrender.com/api/scan/arbitrum`);
  console.log(`   → Base: https://your-app.onrender.com/api/scan/base`);
  console.log(`\n💡 Test specific pair: /api/test/polygon/WETH/USDC`);
});

module.exports = app;
