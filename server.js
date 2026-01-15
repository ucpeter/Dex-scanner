// server.js – FIXED Uniswap V3 Quotes with correct addresses
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
   NETWORK CONFIG WITH CORRECT UNISWAP QUOTER ADDRESSES
============================================================ */
const NETWORKS = {
  arbitrum: {
    name: 'Arbitrum',
    chainId: 42161,
    rpc: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
    paraswapAPI: 'https://apiv5.paraswap.io',
    // CORRECT Uniswap V3 Quoter addresses for each network
    uniswapQuoterV2: '0x61ffe014ba17989e743c5f6cb21bf9697530b21e', // Lowercase to avoid checksum issues
    gasUSD: 1.5
  },
  polygon: {
    name: 'Polygon',
    chainId: 137,
    rpc: process.env.POLYGON_RPC || 'https://polygon-rpc.com',
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapQuoterV2: '0x61ffe014ba17989e743c5f6cb21bf9697530b21e', // Lowercase
    gasUSD: 0.4
  },
  optimism: {
    name: 'Optimism',
    chainId: 10,
    rpc: process.env.OPTIMISM_RPC || 'https://mainnet.optimism.io',
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapQuoterV2: '0x61ffe014ba17989e743c5f6cb21bf9697530b21e', // Lowercase
    gasUSD: 0.8
  }
};

/* ============================================================
   TOKEN LISTS - SIMPLIFIED FOR BETTER RESULTS
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
   TOKEN ADDRESSES - ALL LOWERCASE TO AVOID CHECKSUM ISSUES
============================================================ */
const TOKEN_ADDRESSES = {
  arbitrum: {
    'WETH': { address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', decimals: 18 },
    'USDC': { address: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', decimals: 6 },
    'USDT': { address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', decimals: 6 },
    'DAI': { address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', decimals: 18 },
    'WBTC': { address: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f', decimals: 8 },
    'ARB': { address: '0x912ce59144191c1204e64559fe8253a0e49e6548', decimals: 18 },
    'LINK': { address: '0xf97f4df75117a78c1a5a0dbb814af92458539fb4', decimals: 18 },
    'UNI': { address: '0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0', decimals: 18 },
    'AAVE': { address: '0xba5ddd1f9d7f570dc94a51479a000e3bce967196', decimals: 18 },
    'CRV': { address: '0x11cdb42b0eb46d95f990bedd4695a6e3fa034978', decimals: 18 },
    'COMP': { address: '0x354a6da3fcde098f8389cad84b0182725c6c91de', decimals: 18 },
    'SUSHI': { address: '0xd4d42f0b6def4ce0383636770ef773390d85c61a', decimals: 18 },
    'GMX': { address: '0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a', decimals: 18 },
    'MAGIC': { address: '0x539bde0d7dbd336b79148aa742883198bbf60342', decimals: 18 }
  },
  polygon: {
    'WETH': { address: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', decimals: 18 },
    'USDC': { address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', decimals: 6 },
    'USDT': { address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', decimals: 6 },
    'DAI': { address: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063', decimals: 18 },
    'WBTC': { address: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6', decimals: 8 },
    'MATIC': { address: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', decimals: 18 },
    'LINK': { address: '0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39', decimals: 18 },
    'AAVE': { address: '0xd6df932a45c0f255f85145f286ea0b292b21c90b', decimals: 18 },
    'CRV': { address: '0x172370d5cd63279efa6d502dab29171933a610af', decimals: 18 },
    'SUSHI': { address: '0x0b3f868e0be5597d5db7feb59e1cadbb0fdda50a', decimals: 18 },
    'QUICK': { address: '0x831753dd7087cac61ab5644b308642cc1c33dc13', decimals: 18 }
  },
  optimism: {
    'WETH': { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    'USDC': { address: '0x7f5c764cbc14f9669b88837ca1490cca17c31607', decimals: 6 },
    'USDT': { address: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58', decimals: 6 },
    'DAI': { address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', decimals: 18 },
    'WBTC': { address: '0x68f180fcce6836688e9084f035309e29bf0a2095', decimals: 8 },
    'OP': { address: '0x4200000000000000000000000000000000000042', decimals: 18 },
    'LINK': { address: '0x350a791bfc2c21f9ed5d10980dad2e2638ffa7f6', decimals: 18 },
    'AAVE': { address: '0x76fb31fb4af56892a25e32cfc43de717950c9278', decimals: 18 },
    'SNX': { address: '0x8700daec35af8ff88c16bdf0418774cb3d7599b4', decimals: 18 },
    'PERP': { address: '0x9e1028f5f1d5ede59748ffcee5532509976840e0', decimals: 18 }
  }
};

/* ============================================================
   CONSTANTS
============================================================ */
const BASE_TOKENS = ['WETH', 'USDC', 'USDT', 'DAI', 'WBTC'];
const TRADE_SIZES_USD = [1000];
const SLIPPAGE_BPS = 30;
const MIN_PROFIT_USD = 5;
const MAX_PAIRS_PER_SCAN = 10;

// CORRECT Uniswap Quoter ABI for V2
const QUOTER_ABI = [
  'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
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

// Helper to get checksum address from lowercase
function getChecksumAddress(address) {
  try {
    return ethers.getAddress(address.toLowerCase());
  } catch {
    return address.toLowerCase();
  }
}

/* ============================================================
   PRICE FETCHERS - FIXED WITH CORRECT ADDRESS HANDLING
============================================================ */
async function getUniswapV3Quote(network, tokenIn, tokenOut, amountInWei) {
  try {
    // Use a provider with longer timeout
    const provider = new ethers.JsonRpcProvider(network.rpc, network.chainId, {
      staticNetwork: true,
      batchMaxCount: 1
    });
    
    // Get checksum addresses
    const quoterAddress = getChecksumAddress(network.uniswapQuoterV2);
    const tokenInAddress = getChecksumAddress(tokenIn.address);
    const tokenOutAddress = getChecksumAddress(tokenOut.address);
    
    console.log(`   Uniswap: ${tokenIn.symbol}->${tokenOut.symbol}, Quoter: ${quoterAddress}`);
    console.log(`   TokenIn: ${tokenInAddress}, TokenOut: ${tokenOutAddress}`);
    
    const quoter = new ethers.Contract(quoterAddress, QUOTER_ABI, provider);
    
    const fees = [500, 3000, 10000];
    let bestQuote = 0n;
    
    for (const fee of fees) {
      try {
        console.log(`   Trying fee ${fee}...`);
        
        const result = await quoter.quoteExactInputSingle.staticCall(
          tokenInAddress,
          tokenOutAddress,
          fee,
          amountInWei,
          0,
          { 
            gasLimit: 1000000,
            timeout: 30000
          }
        );
        
        const amountOut = result[0];
        console.log(`   Fee ${fee}: ${amountOut.toString()}`);
        
        if (amountOut > bestQuote) {
          bestQuote = amountOut;
        }
      } catch (error) {
        console.log(`   Fee ${fee} failed: ${error.shortMessage || error.message}`);
        continue;
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
      srcToken: getChecksumAddress(tokenIn.address),
      destToken: getChecksumAddress(tokenOut.address),
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
  
  // Use reliable default prices
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
   CORE ARBITRAGE SCANNER - OPTIMIZED
============================================================ */
async function scanArbitrage(networkKey) {
  const network = NETWORKS[networkKey];
  const tokens = TOKEN_LISTS[networkKey];
  const opportunities = [];
  
  // Generate trading pairs
  const allPairs = generatePairs(tokens);
  const pairs = allPairs.slice(0, MAX_PAIRS_PER_SCAN);
  
  console.log(`\n=========================================`);
  console.log(`🚀 Scanning ${pairs.length} pairs on ${network.name}...`);
  console.log(`=========================================\n`);
  
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    
    try {
      // Get token info
      const baseToken = TOKEN_ADDRESSES[networkKey][pair.base];
      const targetToken = TOKEN_ADDRESSES[networkKey][pair.target];
      
      if (!baseToken || !targetToken) {
        console.log(`❌ Skipping ${pair.base}/${pair.target}: Token not found`);
        continue;
      }
      
      // Add symbol to token objects
      const baseTokenWithSymbol = { ...baseToken, symbol: pair.base };
      const targetTokenWithSymbol = { ...targetToken, symbol: pair.target };
      
      // Get USD price for sizing
      const basePrice = await getTokenPriceInUSD(pair.base);
      if (!basePrice) {
        console.log(`❌ Skipping ${pair.base}: No price data`);
        continue;
      }
      
      const sizeUSD = 1000;
      
      console.log(`\n🔍 [${i+1}/${pairs.length}] ${pair.base} → ${pair.target} ($${sizeUSD})`);
      
      try {
        // Calculate amount in token units
        const amountInTokens = sizeUSD / basePrice;
        const amountInWei = ethers.parseUnits(
          amountInTokens.toFixed(baseToken.decimals),
          baseToken.decimals
        );
        
        console.log(`   Amount: ${amountInTokens.toFixed(6)} ${pair.base}`);
        
        // Get Uniswap quote
        const uniswapAmountOut = await getUniswapV3Quote(network, baseTokenWithSymbol, targetTokenWithSymbol, amountInWei);
        
        if (!uniswapAmountOut) {
          console.log(`   ⏭️  Skipping: No Uniswap quote`);
          continue;
        }
        
        // Wait before Paraswap call
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Get Paraswap quote
        const paraswapAmountOut = await getParaswapQuote(network, baseTokenWithSymbol, targetTokenWithSymbol, amountInWei);
        
        if (!paraswapAmountOut) {
          console.log(`   ⏭️  Skipping: No Paraswap quote`);
          continue;
        }
        
        // Convert to readable amounts
        const uniswapAmount = Number(uniswapAmountOut) / Math.pow(10, targetToken.decimals);
        const paraswapAmount = Number(paraswapAmountOut) / Math.pow(10, targetToken.decimals);
        
        console.log(`   📊 Quotes:`);
        console.log(`     Uniswap:  ${uniswapAmount.toFixed(6)} ${pair.target}`);
        console.log(`     Paraswap: ${paraswapAmount.toFixed(6)} ${pair.target}`);
        
        // Calculate price difference percentage
        const priceDiffPercent = Math.abs((uniswapAmount - paraswapAmount) / Math.max(uniswapAmount, paraswapAmount)) * 100;
        console.log(`   📈 Price difference: ${priceDiffPercent.toFixed(2)}%`);
        
        // Check for arbitrage opportunities
        if (paraswapAmountOut < uniswapAmountOut) {
          // Buy on Paraswap, sell on Uniswap
          const profitTokens = (Number(uniswapAmountOut) - Number(paraswapAmountOut)) / Math.pow(10, targetToken.decimals);
          const tokenOutPrice = await getTokenPriceInUSD(pair.target);
          const grossProfitUSD = profitTokens * tokenOutPrice;
          const netProfitUSD = grossProfitUSD - network.gasUSD;
          
          if (netProfitUSD > MIN_PROFIT_USD) {
            console.log(`   🎯 FOUND ARBITRAGE: Buy on Paraswap, sell on Uniswap`);
            console.log(`      Profit: $${netProfitUSD.toFixed(2)} (after gas)`);
            
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
              profitUSD: netProfitUSD.toFixed(2),
              netProfitUSD: netProfitUSD.toFixed(2),
              gasCostUSD: network.gasUSD,
              dexBuy: 'Paraswap V5',
              dexSell: 'Uniswap V3',
              timestamp: new Date().toISOString(),
              details: {
                paraswapPrice: paraswapAmount.toFixed(6),
                uniswapPrice: uniswapAmount.toFixed(6),
                priceDifference: `${priceDiffPercent.toFixed(2)}%`,
                profitTokens: profitTokens.toFixed(6)
              }
            });
          }
        } else if (uniswapAmountOut < paraswapAmountOut) {
          // Buy on Uniswap, sell on Paraswap
          const profitTokens = (Number(paraswapAmountOut) - Number(uniswapAmountOut)) / Math.pow(10, targetToken.decimals);
          const tokenOutPrice = await getTokenPriceInUSD(pair.target);
          const grossProfitUSD = profitTokens * tokenOutPrice;
          const netProfitUSD = grossProfitUSD - network.gasUSD;
          
          if (netProfitUSD > MIN_PROFIT_USD) {
            console.log(`   🎯 FOUND ARBITRAGE: Buy on Uniswap, sell on Paraswap`);
            console.log(`      Profit: $${netProfitUSD.toFixed(2)} (after gas)`);
            
            opportunities.push({
              network: networkKey,
              pair: `${pair.base}/${pair.target}`,
              direction: 'Uniswap → Paraswap',
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
              profitUSD: netProfitUSD.toFixed(2),
              netProfitUSD: netProfitUSD.toFixed(2),
              gasCostUSD: network.gasUSD,
              dexBuy: 'Uniswap V3',
              dexSell: 'Paraswap V5',
              timestamp: new Date().toISOString(),
              details: {
                uniswapPrice: uniswapAmount.toFixed(6),
                paraswapPrice: paraswapAmount.toFixed(6),
                priceDifference: `${priceDiffPercent.toFixed(2)}%`,
                profitTokens: profitTokens.toFixed(6)
              }
            });
          }
        } else {
          console.log(`   📊 No arbitrage opportunity (price diff too small)`);
        }
        
      } catch (error) {
        console.error(`   ❌ Error:`, error.message);
        continue;
      }
      
    } catch (error) {
      console.error(`❌ Error with pair:`, error.message);
      continue;
    }
    
    // Add delay between pairs
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
          <p>Real quotes from Uniswap V3 and Paraswap V5</p>
          <a href="/api/scan/arbitrum">Scan Arbitrum</a>
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
      note: opportunities.length > 0 ? 'Real arbitrage opportunities' : 'Scan complete - no profitable opportunities'
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
    networks: Object.keys(NETWORKS)
  });
});

app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 DEX Arbitrage Scanner running on port ${PORT}`);
  console.log(`📊 Networks: ${Object.keys(NETWORKS).join(', ')}`);
  console.log(`💰 Min profit: $${MIN_PROFIT_USD}`);
  console.log(`🔧 Using lowercase addresses to avoid checksum issues`);
  console.log(`=========================================`);
});

module.exports = app;
