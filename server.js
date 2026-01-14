// server.js – Real-time DEX Arbitrage Scanner (Uniswap V3 ↔ Paraswap V5)
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const axios = require('axios');

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
   TOKEN LISTS (FULL LISTS)
============================================================ */
const TOKEN_LISTS = {
  arbitrum: [
    '1INCH', 'AAVE', 'ACX', 'AEVO', 'AGLD', 'AIOZ', 'ALEPH', 'ALI', 'ALPHA', 'ANKR', 'APE',
    'API3', 'ARB', 'ARKM', 'ATA', 'ATH', 'AXL', 'AXS', 'BAL', 'BAT', 'BICO', 'BIT', 'BLUR',
    'BNT', 'BOND', 'CAKE', 'CELO', 'COMP', 'COW', 'CRV', 'CTX', 'CVC', 'DAI', 'DIA', 'DNT',
    'DPI', 'DYDX', 'ENA', 'ENJ', 'ENS', 'ETH', 'ETHFI', 'MAGIC', 'MANA', 'MASK', 'MATIC',
    'FET', 'FLUX', 'FORT', 'FOX', 'FRAX', 'FTM', 'FXS', 'GAL', 'GALA', 'GMX', 'GRT', 'IMX',
    'INJ', 'JASMY', 'LDO', 'LINK', 'LIT', 'LPT', 'LQTY', 'LRC', 'LUSD', 'MORPHO', 'MPL',
    'NMR', 'OCEAN', 'OGN', 'OMG', 'ONDO', 'PENDLE', 'PEPE', 'PERP', 'POL', 'POLS', 'PRIME',
    'QNT', 'RAD', 'RAI', 'RARI', 'REN', 'REQ', 'RLC', 'RNDR', 'RPL', 'RSR', 'SAND', 'SHIB',
    'SNX', 'SPELL', 'STORJ', 'SUPER', 'SUSHI', 'TRB', 'UMA', 'UNI', 'USDC', 'USDT', 'WBTC',
    'WETH', 'YFI', 'ZRO', 'ZRX'
  ],
  polygon: [
    '1INCH', 'AAVE', 'ACX', 'AGLD', 'AIOZ', 'ALEPH', 'ALPHA', 'AMP', 'APE', 'API3', 'AXS',
    'BAL', 'BAT', 'BICO', 'BNT', 'BOND', 'BUSD', 'CHZ', 'COMP', 'CRV', 'DAI', 'DPI', 'DYDX',
    'ENJ', 'ENS', 'FARM', 'FET', 'FORT', 'FOX', 'FRAX', 'FTM', 'FXS', 'GALA', 'GRT', 'IMX',
    'INJ', 'JASMY', 'KNC', 'LDO', 'LINK', 'LIT', 'LPT', 'LQTY', 'LRC', 'LUSD', 'MANA', 'MASK',
    'MATIC', 'MIM', 'MKR', 'NMR', 'OGN', 'OMG', 'ORN', 'PENDLE', 'PERP', 'POL', 'QNT', 'RAD',
    'RAI', 'RARI', 'REN', 'REQ', 'RNDR', 'SAND', 'SHIB', 'SNX', 'SPELL', 'STORJ', 'SUPER',
    'SUSHI', 'TRB', 'UMA', 'UNI', 'USDC', 'USDT', 'WBTC', 'WETH', 'YFI', 'ZRO', 'ZRX'
  ],
  optimism: [
    '1INCH', 'AAVE', 'ACX', 'BAL', 'BICO', 'BOND', 'CELO', 'DAI', 'ENS', 'ETH', 'FOX', 'FRAX',
    'FXS', 'GTC', 'LDO', 'LINK', 'LRC', 'LUSD', 'MASK', 'MKR', 'OCEAN', 'OP', 'PENDLE',
    'PEPE', 'PERP', 'RAI', 'RPL', 'SNX', 'SUSHI', 'TRB', 'UMA', 'UNI', 'USDC', 'USDT',
    'WBTC', 'WETH', 'WOO', 'YFI', 'ZRO', 'ZRX'
  ]
};

/* ============================================================
   TOKEN ADDRESS RESOLVER
============================================================ */
class TokenResolver {
  constructor() {
    this.baseTokens = {
      'WETH': {
        arbitrum: { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
        polygon: { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
        optimism: { address: '0x4200000000000000000000000000000000000006', decimals: 18 }
      },
      'USDC': {
        arbitrum: { address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', decimals: 6 },
        polygon: { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6 },
        optimism: { address: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', decimals: 6 }
      },
      'USDT': {
        arbitrum: { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
        polygon: { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
        optimism: { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6 }
      },
      'DAI': {
        arbitrum: { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
        polygon: { address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18 },
        optimism: { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 }
      },
      'WBTC': {
        arbitrum: { address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8 },
        polygon: { address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', decimals: 8 },
        optimism: { address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095', decimals: 8 }
      }
    };
    
    // Common token addresses for each network
    this.commonTokens = {
      arbitrum: {
        'ARB': { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
        'LINK': { address: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4', decimals: 18 },
        'UNI': { address: '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0', decimals: 18 },
        'MATIC': { address: '0x561877b6b3DD7651313794e5F2894B2F18bE0766', decimals: 18 },
        'AAVE': { address: '0xba5DdD1f9d7F570dc94a51479a000E3BCE967196', decimals: 18 },
        'CRV': { address: '0x11cDb42B0EB46D95f990BeDD4695A6e3fA034978', decimals: 18 },
        'SNX': { address: '0xcBA56Cd8216FCBBF3f6bd1b0CacBc1cB9e5dFEc1', decimals: 18 },
        'COMP': { address: '0x354A6dA3fcde098F8389cad84b0182725c6C91dE', decimals: 18 },
        'MKR': { address: '0x2e9a6Df78E42a30712c10a9Dc4b1C8656f8F2879', decimals: 18 },
        'SUSHI': { address: '0xd4d42F0b6DEF4CE0383636770eF773390d85c61A', decimals: 18 }
      },
      polygon: {
        'MATIC': { address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18 },
        'LINK': { address: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39', decimals: 18 },
        'AAVE': { address: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B', decimals: 18 },
        'CRV': { address: '0x172370d5Cd63279eFa6d502DAB29171933a610AF', decimals: 18 },
        'SUSHI': { address: '0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a', decimals: 18 },
        'QUICK': { address: '0x831753DD7087CaC61aB5644b308642cc1c33Dc13', decimals: 18 }
      },
      optimism: {
        'OP': { address: '0x4200000000000000000000000000000000000042', decimals: 18 },
        'LINK': { address: '0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6', decimals: 18 },
        'AAVE': { address: '0x76FB31fb4af56892A25e32cFC43De717950c9278', decimals: 18 },
        'SNX': { address: '0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4', decimals: 18 },
        'PERP': { address: '0x9e1028F5F1D5eDE59748FFceE5532509976840E0', decimals: 18 }
      }
    };
  }

  async resolveToken(networkKey, symbol) {
    const cacheKey = `${networkKey}:${symbol}`;
    
    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
    
    // Check if it's a base token
    if (this.baseTokens[symbol] && this.baseTokens[symbol][networkKey]) {
      const tokenInfo = {
        address: this.baseTokens[symbol][networkKey].address,
        decimals: this.baseTokens[symbol][networkKey].decimals,
        symbol: symbol
      };
      cache.set(cacheKey, { data: tokenInfo, timestamp: Date.now() });
      return tokenInfo;
    }
    
    // Check common tokens
    if (this.commonTokens[networkKey] && this.commonTokens[networkKey][symbol]) {
      const tokenInfo = {
        ...this.commonTokens[networkKey][symbol],
        symbol: symbol
      };
      cache.set(cacheKey, { data: tokenInfo, timestamp: Date.now() });
      return tokenInfo;
    }
    
    // Try to fetch from DexScreener
    try {
      const tokenInfo = await this.fetchTokenFromDexScreener(networkKey, symbol);
      if (tokenInfo) {
        cache.set(cacheKey, { data: tokenInfo, timestamp: Date.now() });
        return tokenInfo;
      }
    } catch (error) {
      console.log(`Failed to fetch ${symbol} from DexScreener:`, error.message);
    }
    
    // Return null if token not found
    return null;
  }

  async fetchTokenFromDexScreener(networkKey, symbol) {
    const chainMap = {
      arbitrum: 'arbitrum',
      polygon: 'polygon',
      optimism: 'optimism'
    };
    
    const chain = chainMap[networkKey];
    if (!chain) return null;
    
    try {
      const response = await axios.get(
        `https://api.dexscreener.com/latest/dex/search?q=${symbol}`,
        { timeout: 5000 }
      );
      
      const pairs = response.data.pairs || [];
      for (const pair of pairs) {
        if (pair.chainId === chain && 
            (pair.baseToken.symbol.toUpperCase() === symbol.toUpperCase() || 
             pair.quoteToken.symbol.toUpperCase() === symbol.toUpperCase())) {
          
          const token = pair.baseToken.symbol.toUpperCase() === symbol.toUpperCase() 
            ? pair.baseToken 
            : pair.quoteToken;
          
          return {
            address: token.address,
            decimals: token.decimals || 18,
            symbol: symbol.toUpperCase()
          };
        }
      }
    } catch (error) {
      console.error(`Error fetching token ${symbol}:`, error.message);
    }
    
    return null;
  }
}

const tokenResolver = new TokenResolver();

/* ============================================================
   CONSTANTS
============================================================ */
const BASE_TOKENS = ['WETH', 'USDC', 'USDT', 'DAI', 'WBTC'];
const TRADE_SIZES_USD = [1000, 5000];
const SLIPPAGE_BPS = 30;
const MIN_PROFIT_USD = 5;
const MAX_PAIRS_PER_SCAN = 20; // Reduced for faster scanning

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
   PRICE FETCHERS
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
    console.error(`Uniswap quote error:`, error.message);
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
      side: 'SELL',
      excludeDEXS: 'Uniswap'
    };

    const response = await axios.get(url, { params, timeout: 10000 });
    
    if (response.data?.priceRoute?.destAmount) {
      return BigInt(response.data.priceRoute.destAmount);
    }
    return null;
  } catch (error) {
    console.error(`Paraswap quote error:`, error.message);
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
  
  try {
    // Use CoinGecko API
    const coinId = symbol.toLowerCase().replace('w', '');
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
      { timeout: 5000 }
    );
    
    if (response.data[coinId]?.usd) {
      const price = response.data[coinId].usd;
      cache.set(cacheKey, { data: price, timestamp: Date.now() });
      return price;
    }
  } catch (_) {
    // Fallback to DexScreener
    try {
      const response = await axios.get(
        `https://api.dexscreener.com/latest/dex/search?q=${symbol}`,
        { timeout: 5000 }
      );
      
      if (response.data.pairs?.[0]?.priceUsd) {
        const price = parseFloat(response.data.pairs[0].priceUsd);
        cache.set(cacheKey, { data: price, timestamp: Date.now() });
        return price;
      }
    } catch (_) {}
  }
  
  // Default prices for common tokens
  const defaultPrices = {
    'WETH': 3000, 'ETH': 3000,
    'USDC': 1, 'USDT': 1, 'DAI': 1,
    'WBTC': 60000, 'BTC': 60000,
    'ARB': 1.2, 'LINK': 15, 'UNI': 7,
    'MATIC': 0.8, 'AAVE': 100, 'OP': 2.5
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
  
  // Generate trading pairs
  const allPairs = generatePairs(tokens);
  const pairs = allPairs.slice(0, MAX_PAIRS_PER_SCAN);
  
  console.log(`Scanning ${pairs.length} pairs on ${network.name}...`);
  
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    
    try {
      // Resolve token addresses and decimals
      const baseToken = await tokenResolver.resolveToken(networkKey, pair.base);
      const targetToken = await tokenResolver.resolveToken(networkKey, pair.target);
      
      if (!baseToken || !targetToken) {
        continue;
      }
      
      // Get USD price for sizing
      const basePrice = await getTokenPriceInUSD(pair.base);
      if (!basePrice) continue;
      
      for (const sizeUSD of TRADE_SIZES_USD) {
        try {
          // Calculate amount in token units
          const amountInTokens = sizeUSD / basePrice;
          const amountInWei = ethers.parseUnits(
            amountInTokens.toFixed(baseToken.decimals),
            baseToken.decimals
          );
          
          // Get quotes from both DEXs
          const [uniswapAmountOut, paraswapAmountOut] = await Promise.all([
            getUniswapV3Quote(network, baseToken, targetToken, amountInWei),
            getParaswapQuote(network, baseToken, targetToken, amountInWei)
          ]);
          
          if (!uniswapAmountOut || !paraswapAmountOut) {
            continue;
          }
          
          // Strategy 1: Buy on Paraswap, sell on Uniswap
          const paraswapToUniswapProfit = await calculateProfit(
            network,
            baseToken,
            targetToken,
            amountInWei,
            paraswapAmountOut,
            uniswapAmountOut,
            sizeUSD
          );
          
          if (paraswapToUniswapProfit > MIN_PROFIT_USD) {
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
              timestamp: new Date().toISOString()
            });
          }
          
        } catch (error) {
          console.error(`Error processing size ${sizeUSD} for ${pair.base}/${pair.target}:`, error.message);
          continue;
        }
      }
      
    } catch (error) {
      console.error(`Error processing pair ${pair.base}/${pair.target}:`, error.message);
      continue;
    }
    
    // Add small delay to avoid rate limiting
    if (i % 5 === 0) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  console.log(`Found ${opportunities.length} opportunities on ${network.name}`);
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
      opportunities 
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
    count: TOKEN_LISTS[network].length
  });
});

app.get('/health', (_, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    networks: Object.keys(NETWORKS),
    uptime: process.uptime()
  });
});

/* ============================================================
   START SERVER
============================================================ */
app.listen(PORT, () => {
  console.log(`🚀 Arbitrage Scanner running on port ${PORT}`);
  console.log(`📊 Supported networks: ${Object.keys(NETWORKS).join(', ')}`);
});

module.exports = app;
