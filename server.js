const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 10000;

/* ============================================================
   NETWORK CONFIG
============================================================ */
const NETWORKS = {
  arbitrum: {
    name: 'Arbitrum',
    chainId: 42161,
    rpc: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapQuoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    uniswapQuoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
    explorer: 'https://arbiscan.io'
  },
  polygon: {
    name: 'Polygon',
    chainId: 137,
    rpc: process.env.POLYGON_RPC || 'https://polygon-rpc.com',
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapQuoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    uniswapQuoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
    explorer: 'https://polygonscan.com'
  },
  optimism: {
    name: 'Optimism',
    chainId: 10,
    rpc: process.env.OPTIMISM_RPC || 'https://mainnet.optimism.io',
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapQuoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    uniswapQuoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
    explorer: 'https://optimistic.etherscan.io'
  }
};

/* ============================================================
   TOKEN LISTS
============================================================ */
const TOKEN_LISTS = {
  arbitrum: [
    'WETH', 'USDC', 'USDT', 'DAI', 'WBTC', 'ARB', 'LINK', 'UNI', 'AAVE',
    'CRV', 'COMP', 'SUSHI', 'GMX', 'MAGIC'
  ],
  polygon: [
    'WETH', 'USDC', 'USDT', 'DAI', 'WBTC', 'MATIC', 'LINK', 'AAVE', 'CRV',
    'SUSHI', 'QUICK'
  ],
  optimism: [
    'WETH', 'USDC', 'USDT', 'DAI', 'WBTC', 'OP', 'LINK', 'AAVE', 'SNX',
    'PERP'
  ]
};

/* ============================================================
   TOKEN ADDRESSES
============================================================ */
const TOKEN_ADDRESSES = {
  arbitrum: {
    'WETH': { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
    'USDC': { address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', decimals: 6 },
    'USDT': { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
    'DAI': { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
    'WBTC': { address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8 },
    'ARB': { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
    'LINK': { address: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4', decimals: 18 },
    'UNI': { address: '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0', decimals: 18 },
    'AAVE': { address: '0xba5DdD1f9d7F570dc94a51479a000E3BCE967196', decimals: 18 },
    'CRV': { address: '0x11cDb42B0EB46D95f990BeDD4695A6e3fA034978', decimals: 18 },
    'COMP': { address: '0x354A6dA3fcde098F8389cad84b0182725c6C91dE', decimals: 18 },
    'SUSHI': { address: '0xd4d42F0b6DEF4CE0383636770eF773390d85c61A', decimals: 18 },
    'GMX': { address: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a', decimals: 18 },
    'MAGIC': { address: '0x539bdE0d7Dbd336b79148AA742883198BBF60342', decimals: 18 }
  },
  polygon: {
    'WETH': { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
    'USDC': { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6 },
    'USDT': { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
    'DAI': { address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18 },
    'WBTC': { address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', decimals: 8 },
    'MATIC': { address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18 },
    'LINK': { address: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39', decimals: 18 },
    'AAVE': { address: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B', decimals: 18 },
    'CRV': { address: '0x172370d5Cd63279eFa6d502DAB29171933a610AF', decimals: 18 },
    'SUSHI': { address: '0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a', decimals: 18 },
    'QUICK': { address: '0x831753DD7087CaC61aB5644b308642cc1c33Dc13', decimals: 18 }
  },
  optimism: {
    'WETH': { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    'USDC': { address: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', decimals: 6 },
    'USDT': { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6 },
    'DAI': { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
    'WBTC': { address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095', decimals: 8 },
    'OP': { address: '0x4200000000000000000000000000000000000042', decimals: 18 },
    'LINK': { address: '0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6', decimals: 18 },
    'AAVE': { address: '0x76FB31fb4af56892A25e32cFC43De717950c9278', decimals: 18 },
    'SNX': { address: '0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4', decimals: 18 },
    'PERP': { address: '0x9e1028F5F1D5eDE59748FFceE5532509976840E0', decimals: 18 }
  }
};

/* ============================================================
   CONSTANTS
============================================================ */
const BASE_TOKENS = ['WETH', 'USDC', 'USDT', 'DAI', 'WBTC'];
const TRADE_SIZES_USD = [1000];
const MIN_PROFIT_USD = 5;
const MAX_PAIRS_PER_SCAN = 10;

// Quoter ABI
const QUOTER_ABI = [
  'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitXHR) external view returns (uint256 amountOut)'
];

/* ============================================================
   HELPER FUNCTIONS
============================================================ */
function generatePairs(tokens) {
  const pairs = [];
  for (const base of BASE_TOKENS) {
    for (const token of tokens) {
      const tokenUpper = token.toUpperCase();
      const baseUpper = base.toUpperCase();
      if (tokenUpper !== baseUpper) {
        pairs.push({ 
          base: baseUpper,
          target: tokenUpper 
        });
      }
    }
  }
  return pairs;
}

/* ============================================================
   GAS ESTIMATION - FIXED ($0.40 for Polygon, not $555)
============================================================ */
async function estimateGasCost(networkKey) {
  // FIXED GAS COSTS
  const fixedGasCosts = {
    arbitrum: 1.5,   // $1.50 on Arbitrum
    polygon: 0.4,    // $0.40 on Polygon (NOT $555!)
    optimism: 0.8    // $0.80 on Optimism
  };
  
  const gasCost = fixedGasCosts[networkKey] || 1.0;
  console.log(`   Gas cost: $${gasCost.toFixed(2)} (fixed for ${NETWORKS[networkKey].name})`);
  return gasCost;
}

/* ============================================================
   PRICE FETCHERS
============================================================ */
async function getUniswapV3Quote(network, tokenIn, tokenOut, amountInWei) {
  try {
    const provider = new ethers.JsonRpcProvider(network.rpc, network.chainId, {
      staticNetwork: true
    });
    
    console.log(`   Uniswap: ${tokenIn.symbol}->${tokenOut.symbol}`);
    
    const quoter = new ethers.Contract(network.uniswapQuoter, QUOTER_ABI, provider);
    
    const fees = [500, 3000, 10000];
    let bestQuote = 0n;
    
    for (const fee of fees) {
      try {
        console.log(`   Trying fee ${fee}...`);
        
        const amountOut = await quoter.quoteExactInputSingle.staticCall(
          tokenIn.address,
          tokenOut.address,
          fee,
          amountInWei,
          0
        );
        
        console.log(`   Fee ${fee}: ${amountOut.toString()}`);
        
        if (amountOut > bestQuote) {
          bestQuote = amountOut;
        }
      } catch (error) {
        const errorMsg = error.shortMessage || error.message;
        if (errorMsg.includes('reverted') || 
            errorMsg.includes('Unexpected error') ||
            errorMsg.includes('no data present')) {
          console.log(`   Fee ${fee}: No liquidity`);
          continue;
        }
        console.log(`   Fee ${fee} failed: ${errorMsg}`);
      }
    }
    
    if (bestQuote > 0n) {
      console.log(`   ✅ Uniswap best quote: ${bestQuote.toString()}`);
      return bestQuote;
    } else {
      console.log(`   ❌ No Uniswap quotes available`);
      return null;
    }
  } catch (error) {
    console.error(`   ❌ Uniswap quote error:`, error.shortMessage || error.message);
    return null;
  }
}

async function getParaswapQuote(network, tokenIn, tokenOut, amountInWei) {
  try {
    const url = `${network.paraswapAPI}/prices`;
    
    const params = {
      srcToken: tokenIn.address,
      destToken: tokenOut.address,
      amount: amountInWei.toString(),
      srcDecimals: tokenIn.decimals,
      destDecimals: tokenOut.decimals,
      network: network.chainId,
      side: 'SELL'
    };

    console.log(`   Paraswap: ${tokenIn.symbol}->${tokenOut.symbol}`);

    const response = await axios.get(url, { 
      params, 
      timeout: 15000
    });
    
    console.log(`   Paraswap response: ${response.status}`);
    
    if (response.data?.priceRoute?.destAmount) {
      const destAmount = BigInt(response.data.priceRoute.destAmount);
      console.log(`   ✅ Paraswap quote: ${destAmount.toString()}`);
      return destAmount;
    } else {
      console.log(`   ❌ Paraswap no price route`);
      return null;
    }
  } catch (error) {
    console.error(`   ❌ Paraswap error:`, error.response?.status || error.message);
    return null;
  }
}

/* ============================================================
   PRICE ORACLE
============================================================ */
async function getTokenPriceInUSD(symbol) {
  const cacheKey = `price:${symbol}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  const defaultPrices = {
    'WETH': 3200, 'ETH': 3200,
    'USDC': 1, 'USDT': 1, 'DAI': 1,
    'WBTC': 65000, 'BTC': 65000,
    'ARB': 1.5, 'LINK': 18, 'UNI': 8,
    'AAVE': 110, 'CRV': 0.6, 'COMP': 60,
    'SUSHI': 1.2, 'GMX': 45, 'MAGIC': 1.1,
    'MATIC': 0.9, 'OP': 3.2, 'SNX': 3.5,
    'PERP': 1.8, 'QUICK': 70
  };
  
  const price = defaultPrices[symbol] || 1;
  cache.set(cacheKey, { data: price, timestamp: Date.now() });
  return price;
}

/* ============================================================
   CORE ARBITRAGE SCANNER
============================================================ */
async function scanArbitrage(networkKey) {
  const network = NETWORKS[networkKey];
  const tokens = TOKEN_LISTS[networkKey];
  const opportunities = [];
  
  const allPairs = generatePairs(tokens);
  const pairs = allPairs.slice(0, MAX_PAIRS_PER_SCAN);
  
  console.log(`\n=========================================`);
  console.log(`🚀 Scanning ${pairs.length} pairs on ${network.name}...`);
  console.log(`=========================================\n`);
  
  const currentGasUSD = await estimateGasCost(networkKey);
  console.log(`⛽ Estimated gas cost: $${currentGasUSD}\n`);
  
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    
    try {
      const baseToken = TOKEN_ADDRESSES[networkKey][pair.base];
      const targetToken = TOKEN_ADDRESSES[networkKey][pair.target];
      
      if (!baseToken || !targetToken) {
        console.log(`❌ Skipping ${pair.base}/${pair.target}: Token not found`);
        continue;
      }
      
      const baseTokenWithSymbol = { ...baseToken, symbol: pair.base };
      const targetTokenWithSymbol = { ...targetToken, symbol: pair.target };
      
      const basePrice = await getTokenPriceInUSD(pair.base);
      if (!basePrice) {
        console.log(`❌ Skipping ${pair.base}: No price data`);
        continue;
      }
      
      const sizeUSD = 1000;
      
      console.log(`\n🔍 [${i+1}/${pairs.length}] ${pair.base} → ${pair.target} ($${sizeUSD})`);
      
      try {
        const amountInTokens = sizeUSD / basePrice;
        const amountInWei = ethers.parseUnits(
          amountInTokens.toFixed(Math.min(6, baseToken.decimals)),
          baseToken.decimals
        );
        
        console.log(`   Amount: ${amountInTokens.toFixed(6)} ${pair.base}`);
        
        console.log(`   ⏳ Getting Uniswap quote...`);
        const uniswapAmountOut = await getUniswapV3Quote(network, baseTokenWithSymbol, targetTokenWithSymbol, amountInWei);
        
        if (!uniswapAmountOut) {
          console.log(`   ⏭️  Skipping: No Uniswap quote`);
          continue;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log(`   ⏳ Getting Paraswap quote...`);
        const paraswapAmountOut = await getParaswapQuote(network, baseTokenWithSymbol, targetTokenWithSymbol, amountInWei);
        
        if (!paraswapAmountOut) {
          console.log(`   ⏭️  Skipping: No Paraswap quote`);
          continue;
        }
        
        const uniswapAmount = Number(uniswapAmountOut) / Math.pow(10, targetToken.decimals);
        const paraswapAmount = Number(paraswapAmountOut) / Math.pow(10, targetToken.decimals);
        
        console.log(`   📊 Quotes:`);
        console.log(`     Uniswap V3:  ${uniswapAmount.toFixed(6)} ${pair.target}`);
        console.log(`     Paraswap V5: ${paraswapAmount.toFixed(6)} ${pair.target}`);
        
        const priceDiffPercent = Math.abs((uniswapAmount - paraswapAmount) / Math.max(uniswapAmount, paraswapAmount)) * 100;
        console.log(`   📈 Price difference: ${priceDiffPercent.toFixed(2)}%`);
        
        let profitUSD = 0;
        let direction = '';
        let buyPrice = 0;
        let sellPrice = 0;
        let buyDex = '';
        let sellDex = '';
        
        if (paraswapAmountOut < uniswapAmountOut) {
          const profitTokens = (Number(uniswapAmountOut) - Number(paraswapAmountOut)) / Math.pow(10, targetToken.decimals);
          const tokenOutPrice = await getTokenPriceInUSD(pair.target);
          const grossProfitUSD = profitTokens * tokenOutPrice;
          profitUSD = grossProfitUSD - currentGasUSD;
          direction = 'Paraswap → Uniswap';
          buyPrice = paraswapAmount / (sizeUSD / basePrice);
          sellPrice = uniswapAmount / (sizeUSD / basePrice);
          buyDex = 'Paraswap V5';
          sellDex = 'Uniswap V3';
        } else if (uniswapAmountOut < paraswapAmountOut) {
          const profitTokens = (Number(paraswapAmountOut) - Number(uniswapAmountOut)) / Math.pow(10, targetToken.decimals);
          const tokenOutPrice = await getTokenPriceInUSD(pair.target);
          const grossProfitUSD = profitTokens * tokenOutPrice;
          profitUSD = grossProfitUSD - currentGasUSD;
          direction = 'Uniswap → Paraswap';
          buyPrice = uniswapAmount / (sizeUSD / basePrice);
          sellPrice = paraswapAmount / (sizeUSD / basePrice);
          buyDex = 'Uniswap V3';
          sellDex = 'Paraswap V5';
        }
        
        if (priceDiffPercent > 50) {
          console.log(`   ⚠️  Suspicious price difference (${priceDiffPercent.toFixed(2)}%) - skipping`);
          continue;
        }
        
        if (profitUSD > MIN_PROFIT_USD) {
          console.log(`   🎯 FOUND ARBITRAGE: ${direction}`);
          console.log(`      Profit: $${profitUSD.toFixed(2)} (after gas)`);
          
          opportunities.push({
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            network: networkKey,
            pair: `${pair.base}/${pair.target}`,
            direction: direction,
            tokenIn: { 
              symbol: pair.base,
              address: baseToken.address,
              decimals: baseToken.decimals
            },
            tokenOut: { 
              symbol: pair.target,
              address: targetToken.address,
              decimals: targetToken.decimals
            },
            tradeSizeUSD: sizeUSD,
            profitUSD: profitUSD.toFixed(2),
            netProfitUSD: profitUSD.toFixed(2),
            gasCostUSD: currentGasUSD.toFixed(2),
            dexBuy: buyDex,
            dexSell: sellDex,
            timestamp: new Date().toISOString(),
            priceInfo: {
              buyPrice: buyPrice.toFixed(6),
              sellPrice: sellPrice.toFixed(6),
              buyDex: buyDex,
              sellDex: sellDex
            },
            details: {
              priceDifference: `${priceDiffPercent.toFixed(2)}%`,
              uniswapPrice: uniswapAmount.toFixed(6),
              paraswapPrice: paraswapAmount.toFixed(6)
            }
          });
        } else {
          console.log(`   📊 No arbitrage opportunity (min profit: $${MIN_PROFIT_USD})`);
        }
        
      } catch (error) {
        console.error(`   ❌ Error:`, error.message);
        continue;
      }
      
    } catch (error) {
      console.error(`❌ Error with pair:`, error.message);
      continue;
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\n=========================================`);
  console.log(`✅ Found ${opportunities.length} opportunities on ${network.name}`);
  console.log(`=========================================\n`);
  return opportunities;
}

/* ============================================================
   API ROUTES
============================================================ */
const indexPath = path.join(__dirname, 'index.html');
let indexHtml = null;

try {
  if (fs.existsSync(indexPath)) {
    indexHtml = fs.readFileSync(indexPath, 'utf8');
    console.log(`✅ Found index.html file`);
  }
} catch (error) {
  console.error(`Error reading index.html: ${error.message}`);
}

app.get('/', (req, res) => {
  if (indexHtml) {
    res.send(indexHtml);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>DEX Scanner</title><style>body{background:#0f172a;color:white;padding:20px;}</style></head>
        <body>
          <h1>🚀 DEX Arbitrage Scanner</h1>
          <p>Scanning Uniswap V3 ↔ Paraswap V5</p>
          <a href="/api/scan/arbitrum">Scan Arbitrum</a> |
          <a href="/api/scan/polygon">Scan Polygon</a> |
          <a href="/api/scan/optimism">Scan Optimism</a>
        </body>
      </html>
    `);
  }
});

app.get('/api/scan/:network', async (req, res) => {
  const { network } = req.params;
  
  if (!NETWORKS[network]) {
    return res.status(400).json({ error: 'Invalid network' });
  }
  
  try {
    const opportunities = await scanArbitrage(network);
    res.json({ 
      success: true, 
      network: NETWORKS[network].name,
      count: opportunities.length,
      opportunities,
      gasCost: await estimateGasCost(network),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Scan error for ${network}:`, error);
    res.status(500).json({ 
      success: false, 
      error: 'Scan failed', 
      message: error.message 
    });
  }
});

app.get('/health', (_, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    networks: Object.keys(NETWORKS),
    version: '1.0.0'
  });
});

app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 DEX Arbitrage Scanner running on port ${PORT}`);
  console.log(`📊 Networks: ${Object.keys(NETWORKS).join(', ')}`);
  console.log(`💰 Min profit: $${MIN_PROFIT_USD}`);
  console.log(`⛽ Fixed gas costs: Arbitrum=$1.50, Polygon=$0.40, Optimism=$0.80`);
  console.log(`=========================================`);
});

module.exports = app;
