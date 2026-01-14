// server.js – Real-time DEX Arbitrage Scanner (Uniswap V3 ↔ Paraswap V5)
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const axios = require('axios');
const NodeCache = require('node-cache');

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

const PORT = process.env.PORT || 3001;
const cache = new NodeCache({ stdTTL: 10, checkperiod: 2 });

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
    gasUSD: 1.5,
    multicall: '0x842eC2c7D803033Edf55E478F461FC547Bc54EB2'
  },
  polygon: {
    name: 'Polygon',
    chainId: 137,
    rpc: process.env.POLYGON_RPC || 'https://polygon-rpc.com',
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapQuoterV2: '0x61fE014bA17989E743c5F6cB21bF9697530B21eE',
    gasUSD: 0.4,
    multicall: '0x275617327c958bD06b5D6b871E7f491D76113dd8'
  },
  optimism: {
    name: 'Optimism',
    chainId: 10,
    rpc: process.env.OPTIMISM_RPC || 'https://mainnet.optimism.io',
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapQuoterV2: '0x61fE014bA17989E743c5F6cB21bF9697530B21eE',
    gasUSD: 0.8,
    multicall: '0x2DC0E2aa608532Da689e89e237dF582B783E552C'
  }
};

/* ============================================================
   TOKEN LISTS (FULL LISTS RESTORED)
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
   TOKEN RESOLVER - Dynamically fetch token addresses
============================================================ */
class TokenResolver {
  constructor() {
    // Base tokens with known addresses
    this.baseTokens = {
      'WETH': {
        arbitrum: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        polygon: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
        optimism: '0x4200000000000000000000000000000000000006',
        decimals: 18
      },
      'USDC': {
        arbitrum: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
        polygon: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        optimism: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
        decimals: 6
      },
      'USDT': {
        arbitrum: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        polygon: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        optimism: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
        decimals: 6
      },
      'DAI': {
        arbitrum: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
        polygon: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
        optimism: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
        decimals: 18
      },
      'WBTC': {
        arbitrum: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
        polygon: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
        optimism: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
        decimals: 8
      }
    };
    
    // Cache for resolved tokens
    this.tokenCache = new Map();
  }

  async resolveToken(networkKey, symbol) {
    const cacheKey = `${networkKey}:${symbol}`;
    
    // Return from cache if available
    if (this.tokenCache.has(cacheKey)) {
      return this.tokenCache.get(cacheKey);
    }
    
    // Check if it's a base token
    if (this.baseTokens[symbol] && this.baseTokens[symbol][networkKey]) {
      const tokenInfo = {
        address: this.baseTokens[symbol][networkKey],
        decimals: this.baseTokens[symbol].decimals
      };
      this.tokenCache.set(cacheKey, tokenInfo);
      return tokenInfo;
    }
    
    // For other tokens, we'll use a simplified approach
    // In production, you would use a token list API or on-chain registry
    const tokenInfo = await this.fetchTokenFromDexScreener(networkKey, symbol);
    if (tokenInfo) {
      this.tokenCache.set(cacheKey, tokenInfo);
      return tokenInfo;
    }
    
    return null;
  }

  async fetchTokenFromDexScreener(networkKey, symbol) {
    try {
      const chainIdMap = {
        arbitrum: 'arbitrum',
        polygon: 'polygon',
        optimism: 'optimism'
      };
      
      const chain = chainIdMap[networkKey];
      if (!chain) return null;
      
      const response = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${symbol}`,
        { timeout: 5000 }
      );
      
      const pairs = response.data.pairs || [];
      for (const pair of pairs) {
        if (pair.chainId === chain) {
          // Find which token in the pair matches our symbol
          const token = [pair.baseToken, pair.quoteToken].find(t => 
            t.symbol.toUpperCase() === symbol.toUpperCase()
          );
          
          if (token) {
            return {
              address: token.address,
              decimals: token.decimals || 18
            };
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching token ${symbol} on ${networkKey}:`, error.message);
    }
    
    return null;
  }
}

const tokenResolver = new TokenResolver();

/* ============================================================
   CONSTANTS
============================================================ */
const BASE_TOKENS = ['WETH', 'USDC', 'USDT', 'DAI', 'WBTC'];
const TRADE_SIZES_USD = [1000, 5000, 10000];
const SLIPPAGE_BPS = 30;
const MIN_PROFIT_USD = 5;
const MAX_PAIRS_PER_SCAN = 50; // Limit to avoid timeout

const QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
];

/* ============================================================
   HELPERS
============================================================ */
function tokenIcon(symbol) {
  // Use a generic icon service that doesn't require addresses
  return `https://cryptoicons.org/api/icon/${symbol.toLowerCase()}/200`;
}

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
   PRICE FETCHERS - REAL QUOTES
============================================================ */
async function getUniswapV3Quote(network, tokenIn, tokenOut, amountInWei) {
  try {
    const provider = new ethers.JsonRpcProvider(network.rpc);
    const quoter = new ethers.Contract(network.uniswapQuoterV2, QUOTER_ABI, provider);
    
    // Try different fee tiers
    const fees = [500, 3000, 10000]; // 0.05%, 0.3%, 1%
    let bestQuote = ethers.ZeroAddress;
    
    for (const fee of fees) {
      try {
        const quote = await quoter.quoteExactInputSingle.staticCall([
          tokenIn.address,
          tokenOut.address,
          amountInWei,
          fee,
          0
        ]);
        
        if (quote && quote[0] > bestQuote) {
          bestQuote = quote[0];
        }
      } catch (_) {
        // Fee tier not available for this pair
        continue;
      }
    }
    
    return bestQuote;
  } catch (error) {
    console.error(`Uniswap quote error for ${tokenIn.address}->${tokenOut.address}:`, error.message);
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
      excludeDEXS: 'Uniswap' // Don't include Uniswap in Paraswap route
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
   PRICE ORACLE FOR USD VALUES
============================================================ */
async function getTokenPriceInUSD(networkKey, symbol) {
  const cacheKey = `price:${networkKey}:${symbol}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  
  try {
    // Use CoinGecko or similar API
    const coinId = symbol.toLowerCase();
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
      { timeout: 5000 }
    );
    
    if (response.data[coinId]?.usd) {
      const price = response.data[coinId].usd;
      cache.set(cacheKey, price);
      return price;
    }
  } catch (error) {
    console.error(`Price fetch error for ${symbol}:`, error.message);
  }
  
  // Fallback to DexScreener
  try {
    const response = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${symbol}`,
      { timeout: 5000 }
    );
    
    if (response.data.pairs?.[0]?.priceUsd) {
      const price = parseFloat(response.data.pairs[0].priceUsd);
      cache.set(cacheKey, price);
      return price;
    }
  } catch (_) {}
  
  return null;
}

/* ============================================================
   CORE ARBITRAGE SCANNER - REAL LOGIC
============================================================ */
async function scanArbitrage(networkKey) {
  const network = NETWORKS[networkKey];
  const tokens = TOKEN_LISTS[networkKey];
  const opportunities = [];
  
  // Generate trading pairs
  const allPairs = generatePairs(tokens);
  const pairs = allPairs.slice(0, MAX_PAIRS_PER_SCAN); // Limit for performance
  
  console.log(`Scanning ${pairs.length} pairs on ${network.name}...`);
  
  // Process pairs in batches
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
      const basePrice = await getTokenPriceInUSD(networkKey, pair.base);
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
          
          // Calculate profit opportunities
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
              tokenIn: { symbol: pair.base, address: baseToken.address },
              tokenOut: { symbol: pair.target, address: targetToken.address },
              tradeSizeUSD: sizeUSD,
              profitUSD: paraswapToUniswapProfit.toFixed(2),
              gasCostUSD: network.gasUSD,
              dexBuy: 'Paraswap V5',
              dexSell: 'Uniswap V3',
              timestamp: new Date().toISOString()
            });
          }
          
          // Strategy 2: Buy on Uniswap, sell on Paraswap (reverse direction)
          // Need quotes for opposite direction
          const [uniswapReverseOut, paraswapReverseOut] = await Promise.all([
            getUniswapV3Quote(network, targetToken, baseToken, paraswapAmountOut),
            getParaswapQuote(network, targetToken, baseToken, uniswapAmountOut)
          ]);
          
          if (uniswapReverseOut && paraswapReverseOut) {
            const uniswapToParaswapProfit = await calculateProfit(
              network,
              targetToken,
              baseToken,
              uniswapAmountOut, // Start with Uniswap output
              paraswapReverseOut,
              uniswapReverseOut,
              sizeUSD
            );
            
            if (uniswapToParaswapProfit > MIN_PROFIT_USD) {
              opportunities.push({
                network: networkKey,
                pair: `${pair.target}/${pair.base}`,
                direction: 'Uniswap → Paraswap',
                tokenIn: { symbol: pair.target, address: targetToken.address },
                tokenOut: { symbol: pair.base, address: baseToken.address },
                tradeSizeUSD: sizeUSD,
                profitUSD: uniswapToParaswapProfit.toFixed(2),
                gasCostUSD: network.gasUSD,
                dexBuy: 'Uniswap V3',
                dexSell: 'Paraswap V5',
                timestamp: new Date().toISOString()
              });
            }
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
    if (i % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  console.log(`Found ${opportunities.length} opportunities on ${network.name}`);
  return opportunities;
}

async function calculateProfit(network, tokenIn, tokenOut, amountInWei, buyAmountOut, sellAmountOut, sizeUSD) {
  if (!buyAmountOut || !sellAmountOut) return 0;
  
  try {
    // Calculate price impact and slippage
    const buyPricePerToken = Number(amountInWei) / Number(buyAmountOut);
    const sellPricePerToken = Number(sellAmountOut) / Number(amountInWei);
    
    // Apply slippage
    const sellAmountWithSlippage = Number(sellAmountOut) * (1 - SLIPPAGE_BPS / 10000);
    
    // Calculate profit in token units
    const profitTokens = sellAmountWithSlippage - Number(buyAmountOut);
    
    if (profitTokens <= 0) return 0;
    
    // Convert to USD
    const tokenOutPrice = await getTokenPriceInUSD(network.name.toLowerCase(), tokenOut.symbol);
    if (!tokenOutPrice) return 0;
    
    const grossProfitUSD = profitTokens * tokenOutPrice;
    const netProfitUSD = grossProfitUSD - network.gasUSD;
    
    return netProfitUSD;
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
    networks: Object.keys(NETWORKS)
  });
});

/* ============================================================
   START SERVER
============================================================ */
app.listen(PORT, () => {
  console.log(`🚀 Arbitrage Scanner running on port ${PORT}`);
  console.log(`📊 Supported networks: ${Object.keys(NETWORKS).join(', ')}`);
  console.log(`🔍 Total tokens per network:`);
  Object.entries(TOKEN_LISTS).forEach(([network, tokens]) => {
    console.log(`   ${network}: ${tokens.length} tokens`);
  });
});

module.exports = app;
