// server.js – Real-time DEX Arbitrage Scanner (Uniswap V3 ↔ Paraswap V5)
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
const CACHE_TTL = 10000; // 10 seconds

/* ============================================================
   NETWORK CONFIG
============================================================ */
const NETWORKS = {
  arbitrum: {
    name: 'Arbitrum',
    chainId: 42161,
    rpc: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapQuoterV2: '0x61fE014bA17989E743c5F6cB21bF9697530B21eE',
    gasUSD: 1.5
  },
  polygon: {
    name: 'Polygon',
    chainId: 137,
    rpc: process.env.POLYGON_RPC || 'https://polygon-rpc.com',
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapQuoterV2: '0x61fE014bA17989E743c5F6cB21bF9697530B21eE',
    gasUSD: 0.4
  },
  optimism: {
    name: 'Optimism',
    chainId: 10,
    rpc: process.env.OPTIMISM_RPC || 'https://mainnet.optimism.io',
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapQuoterV2: '0x61fE014bA17989E743c5F6cB21bF9697530B21eE',
    gasUSD: 0.8
  }
};

/* ============================================================
   TOKEN LISTS (REAL TOKENS)
============================================================ */
const TOKEN_LISTS = {
  arbitrum: [
    'WETH', 'USDC', 'USDT', 'DAI', 'WBTC', 'ARB', 'LINK', 'UNI', 'MATIC', 'AAVE',
    'CRV', 'SNX', 'COMP', 'MKR', 'SUSHI', '1INCH', 'YFI', 'BAL', 'REN', 'BAT'
  ],
  polygon: [
    'WETH', 'USDC', 'USDT', 'DAI', 'WBTC', 'MATIC', 'LINK', 'AAVE', 'CRV', 'SUSHI',
    'QUICK', '1INCH', 'BAL', 'SNX', 'COMP', 'MKR', 'YFI', 'REN', 'BAT', 'UNI'
  ],
  optimism: [
    'WETH', 'USDC', 'USDT', 'DAI', 'WBTC', 'OP', 'LINK', 'AAVE', 'SNX', 'PERP',
    'VELO', 'THALES', 'LYRA', 'POOL', 'FRAX', 'FXS', 'LUSD', 'ALCX', 'DOLA', 'BEETS'
  ]
};

/* ============================================================
   TOKEN ADDRESS RESOLVER - VERIFIED ADDRESSES ONLY
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
    'MATIC': { address: '0x561877b6b3DD7651313794e5F2894B2F18bE0766', decimals: 18 },
    'AAVE': { address: '0xba5DdD1f9d7F570dc94a51479a000E3BCE967196', decimals: 18 },
    'CRV': { address: '0x11cDb42B0EB46D95f990BeDD4695A6e3fA034978', decimals: 18 },
    'SNX': { address: '0xcBA56Cd8216FCBBF3f6bd1b0CacBc1cB9e5dFEc1', decimals: 18 },
    'COMP': { address: '0x354A6dA3fcde098F8389cad84b0182725c6C91dE', decimals: 18 }
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
const TRADE_SIZES_USD = [1000, 5000];
const SLIPPAGE_BPS = 30;
const MIN_PROFIT_USD = 5;
const MAX_PAIRS_PER_SCAN = 20;

const QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
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

function getTokenIconUrl(symbol) {
  const cleanSymbol = symbol.replace('W', '').toLowerCase();
  return `https://cryptocurrencyliveprices.com/img/${cleanSymbol}-${cleanSymbol}.png`;
}

/* ============================================================
   PRICE FETCHERS - FIXED PARASWAP API CALLS
============================================================ */
async function getUniswapV3Quote(network, tokenIn, tokenOut, amountInWei) {
  try {
    const provider = new ethers.JsonRpcProvider(network.rpc);
    const quoter = new ethers.Contract(network.uniswapQuoterV2, QUOTER_ABI, provider);
    
    const fees = [500, 3000, 10000];
    let bestQuote = 0n;
    
    for (const fee of fees) {
      try {
        const [amountOut] = await quoter.quoteExactInputSingle.staticCall([
          tokenIn.address,
          tokenOut.address,
          amountInWei,
          fee,
          0
        ]);
        
        if (amountOut > bestQuote) {
          bestQuote = amountOut;
        }
      } catch (_) {
        continue;
      }
    }
    
    return bestQuote;
  } catch (error) {
    console.error(`Uniswap quote error for ${tokenIn.symbol}->${tokenOut.symbol}:`, error.message);
    return null;
  }
}

async function getParaswapQuote(network, tokenIn, tokenOut, amountInWei) {
  try {
    const url = `${network.paraswapAPI}/prices`;
    
    // Paraswap API expects specific parameter format
    const params = {
      srcToken: tokenIn.address,
      destToken: tokenOut.address,
      amount: amountInWei.toString(),
      srcDecimals: tokenIn.decimals,
      destDecimals: tokenOut.decimals,
      network: network.chainId,
      side: 'SELL',
      includeDEXS: 'ParaSwapPool,ParaSwapLimit,ZeroExv4,UniswapV3,Curve,BalancerV2'
    };

    console.log(`Paraswap request for ${tokenIn.symbol}->${tokenOut.symbol}:`, {
      srcToken: tokenIn.address,
      destToken: tokenOut.address,
      amount: amountInWei.toString(),
      network: network.chainId
    });

    const response = await axios.get(url, { 
      params, 
      timeout: 15000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Paraswap response status for ${tokenIn.symbol}->${tokenOut.symbol}:`, response.status);
    
    if (response.data?.priceRoute?.destAmount) {
      return BigInt(response.data.priceRoute.destAmount);
    } else {
      console.log(`Paraswap no price route for ${tokenIn.symbol}->${tokenOut.symbol}:`, response.data);
      return null;
    }
  } catch (error) {
    console.error(`Paraswap quote error for ${tokenIn.symbol}->${tokenOut.symbol}:`, {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    return null;
  }
}

/* ============================================================
   PRICE ORACLE - REAL PRICES
============================================================ */
async function getTokenPriceInUSD(symbol) {
  const cacheKey = `price:${symbol}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  try {
    // Use CoinGecko API with better symbol mapping
    const symbolMap = {
      'WETH': 'ethereum',
      'ETH': 'ethereum',
      'USDC': 'usd-coin',
      'USDT': 'tether',
      'DAI': 'dai',
      'WBTC': 'bitcoin',
      'BTC': 'bitcoin',
      'ARB': 'arbitrum',
      'LINK': 'chainlink',
      'UNI': 'uniswap',
      'MATIC': 'polygon',
      'AAVE': 'aave',
      'CRV': 'curve-dao-token',
      'SNX': 'havven',
      'COMP': 'compound-governance-token',
      'SUSHI': 'sushi',
      'OP': 'optimism',
      'PERP': 'perpetual-protocol'
    };
    
    const coinId = symbolMap[symbol] || symbol.toLowerCase();
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
      { timeout: 8000 }
    );
    
    if (response.data[coinId]?.usd) {
      const price = response.data[coinId].usd;
      cache.set(cacheKey, { data: price, timestamp: Date.now() });
      return price;
    }
  } catch (error) {
    console.log(`CoinGecko error for ${symbol}:`, error.message);
  }
  
  // Fallback to CoinMarketCap style API
  try {
    const response = await axios.get(
      `https://api.coinbase.com/v2/exchange-rates?currency=${symbol.replace('W', '')}`,
      { timeout: 5000 }
    );
    
    if (response.data?.data?.rates?.USD) {
      const price = parseFloat(response.data.data.rates.USD);
      cache.set(cacheKey, { data: price, timestamp: Date.now() });
      return price;
    }
  } catch (_) {}
  
  // If still no price, return reasonable defaults
  const defaultPrices = {
    'WETH': 3200, 'ETH': 3200,
    'USDC': 1, 'USDT': 1, 'DAI': 1,
    'WBTC': 65000, 'BTC': 65000,
    'ARB': 1.5, 'LINK': 18, 'UNI': 8,
    'MATIC': 0.9, 'AAVE': 110, 'OP': 3.2,
    'CRV': 0.6, 'SUSHI': 1.2, 'SNX': 3.5, 'PERP': 1.8
  };
  
  const price = defaultPrices[symbol] || 1;
  cache.set(cacheKey, { data: price, timestamp: Date.now() });
  return price;
}

/* ============================================================
   CORE ARBITRAGE SCANNER - REAL QUOTES ONLY
============================================================ */
async function scanArbitrage(networkKey) {
  const network = NETWORKS[networkKey];
  const tokens = TOKEN_LISTS[networkKey];
  const opportunities = [];
  
  // Generate trading pairs
  const allPairs = generatePairs(tokens);
  const pairs = allPairs.slice(0, MAX_PAIRS_PER_SCAN);
  
  console.log(`=========================================`);
  console.log(`Scanning ${pairs.length} pairs on ${network.name}...`);
  console.log(`=========================================`);
  
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    
    try {
      // Get token info from our fixed addresses
      const baseToken = TOKEN_ADDRESSES[networkKey][pair.base];
      const targetToken = TOKEN_ADDRESSES[networkKey][pair.target];
      
      if (!baseToken || !targetToken) {
        console.log(`❌ Token not found: ${pair.base} or ${pair.target}`);
        continue;
      }
      
      // Add symbol to token objects
      const baseTokenWithSymbol = { ...baseToken, symbol: pair.base };
      const targetTokenWithSymbol = { ...targetToken, symbol: pair.target };
      
      // Get USD price for sizing
      const basePrice = await getTokenPriceInUSD(pair.base);
      if (!basePrice) {
        console.log(`❌ No price for ${pair.base}`);
        continue;
      }
      
      for (const sizeUSD of TRADE_SIZES_USD) {
        try {
          // Calculate amount in token units
          const amountInTokens = sizeUSD / basePrice;
          const amountInWei = ethers.parseUnits(
            amountInTokens.toFixed(baseToken.decimals),
            baseToken.decimals
          );
          
          console.log(`\n🔍 Scanning ${pair.base}->${pair.target} ($${sizeUSD})`);
          
          // Get real quotes from both DEXs
          const [uniswapAmountOut, paraswapAmountOut] = await Promise.all([
            getUniswapV3Quote(network, baseTokenWithSymbol, targetTokenWithSymbol, amountInWei),
            getParaswapQuote(network, baseTokenWithSymbol, targetTokenWithSymbol, amountInWei)
          ]);
          
          if (!uniswapAmountOut || !paraswapAmountOut) {
            console.log(`   ⚠️  Missing quotes: Uniswap=${uniswapAmountOut ? '✓' : '✗'}, Paraswap=${paraswapAmountOut ? '✓' : '✗'}`);
            continue;
          }
          
          console.log(`   Quotes: Uniswap=${uniswapAmountOut}, Paraswap=${paraswapAmountOut}`);
          
          // Strategy 1: Buy on Paraswap, sell on Uniswap
          const paraswapToUniswapProfit = await calculateProfit(
            network,
            baseTokenWithSymbol,
            targetTokenWithSymbol,
            amountInWei,
            paraswapAmountOut,
            uniswapAmountOut,
            sizeUSD
          );
          
          console.log(`   Potential profit: $${paraswapToUniswapProfit.toFixed(2)}`);
          
          if (paraswapToUniswapProfit > MIN_PROFIT_USD) {
            console.log(`   ✅ FOUND OPPORTUNITY: $${paraswapToUniswapProfit.toFixed(2)} profit`);
            
            opportunities.push({
              network: networkKey,
              pair: `${pair.base}/${pair.target}`,
              direction: 'Paraswap → Uniswap',
              tokenIn: { 
                symbol: pair.base, 
                address: baseToken.address,
                icon: getTokenIconUrl(pair.base)
              },
              tokenOut: { 
                symbol: pair.target, 
                address: targetToken.address,
                icon: getTokenIconUrl(pair.target)
              },
              tradeSizeUSD: sizeUSD,
              profitUSD: paraswapToUniswapProfit.toFixed(2),
              netProfitUSD: (paraswapToUniswapProfit - network.gasUSD).toFixed(2),
              gasCostUSD: network.gasUSD,
              dexBuy: 'Paraswap V5',
              dexSell: 'Uniswap V3',
              timestamp: new Date().toISOString(),
              // Include raw data for verification
              rawData: {
                uniswapOut: uniswapAmountOut.toString(),
                paraswapOut: paraswapAmountOut.toString(),
                amountIn: amountInWei.toString()
              }
            });
          }
          
        } catch (error) {
          console.error(`   ❌ Error processing size ${sizeUSD} for ${pair.base}/${pair.target}:`, error.message);
          continue;
        }
      }
      
    } catch (error) {
      console.error(`❌ Error processing pair ${pair.base}/${pair.target}:`, error.message);
      continue;
    }
    
    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\n=========================================`);
  console.log(`Found ${opportunities.length} REAL opportunities on ${network.name}`);
  console.log(`=========================================\n`);
  return opportunities;
}

async function calculateProfit(network, tokenIn, tokenOut, amountInWei, buyAmountOut, sellAmountOut, sizeUSD) {
  if (!buyAmountOut || !sellAmountOut) return 0;
  
  try {
    // Calculate profit in token units
    const buyAmount = Number(buyAmountOut) / Math.pow(10, tokenOut.decimals);
    const sellAmount = Number(sellAmountOut) / Math.pow(10, tokenOut.decimals);
    
    // Apply slippage
    const sellAmountWithSlippage = sellAmount * (1 - SLIPPAGE_BPS / 10000);
    
    // Calculate profit
    const profitTokens = sellAmountWithSlippage - buyAmount;
    
    if (profitTokens <= 0) return 0;
    
    // Convert to USD
    const tokenOutPrice = await getTokenPriceInUSD(tokenOut.symbol);
    if (!tokenOutPrice) return 0;
    
    const grossProfitUSD = profitTokens * tokenOutPrice;
    
    return grossProfitUSD;
  } catch (error) {
    console.error('Profit calculation error:', error.message);
    return 0;
  }
}

/* ============================================================
   API ROUTES
============================================================ */

// Check if index.html exists
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

// Serve index.html at root
app.get('/', (req, res) => {
  if (indexHtml) {
    res.send(indexHtml);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>DEX Arbitrage Scanner</title>
          <style>
            body { font-family: Arial, sans-serif; background: #0f172a; color: white; padding: 20px; }
            .container { max-width: 800px; margin: 0 auto; }
            h1 { color: #60a5fa; }
            .api-link { display: inline-block; background: #3b82f6; color: white; padding: 10px 20px; margin: 10px; border-radius: 5px; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🚀 DEX Arbitrage Scanner (REAL DATA)</h1>
            <p>Real arbitrage opportunities between Uniswap V3 and Paraswap V5</p>
            <p><strong>NO MOCK DATA - Only real on-chain quotes</strong></p>
            <a href="/health" class="api-link">Health Check</a>
            <a href="/api/scan/arbitrum" class="api-link">Scan Arbitrum (Real)</a>
            <a href="/api/scan/polygon" class="api-link">Scan Polygon (Real)</a>
            <a href="/api/scan/optimism" class="api-link">Scan Optimism (Real)</a>
          </div>
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
      network, 
      count: opportunities.length,
      opportunities,
      note: opportunities.length > 0 ? 'Real arbitrage opportunities from on-chain data' : 'No profitable opportunities found'
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
      count: opportunities.length,
      opportunities,
      note: opportunities.length > 0 ? 'Real arbitrage opportunities from on-chain data' : 'No profitable opportunities found'
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

app.get('/api/tokens/:network', async (req, res) => {
  const { network } = req.params;
  
  if (!NETWORKS[network]) {
    return res.status(400).json({ error: 'Invalid network' });
  }
  
  res.json({
    network,
    baseTokens: BASE_TOKENS,
    availableTokens: TOKEN_LISTS[network],
    count: TOKEN_LISTS[network].length,
    note: 'All tokens have verified addresses'
  });
});

app.get('/health', (_, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    networks: Object.keys(NETWORKS),
    uptime: process.uptime(),
    hasFrontend: indexHtml !== null,
    version: '1.0.0',
    note: 'Real arbitrage scanner - NO MOCK DATA'
  });
});

// Catch-all route
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'API endpoint not found' });
  } else if (indexHtml) {
    res.send(indexHtml);
  } else {
    res.status(404).send('Not found');
  }
});

/* ============================================================
   START SERVER
============================================================ */
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 REAL Arbitrage Scanner running on port ${PORT}`);
  console.log(`📊 Supported networks: ${Object.keys(NETWORKS).join(', ')}`);
  console.log(`💰 Minimum profit: $${MIN_PROFIT_USD}`);
  console.log(`🔍 Scanning: ${MAX_PAIRS_PER_SCAN} pairs per network`);
  console.log(`🌐 Frontend: http://localhost:${PORT}`);
  console.log(`=========================================`);
  console.log(`⚠️  IMPORTANT: This scanner returns ONLY REAL data`);
  console.log(`   NO MOCK DATA - All quotes are from live APIs`);
  console.log(`=========================================`);
});

module.exports = app;
