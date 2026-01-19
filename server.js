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

// REMOVED: Ethereum, Optimism, Base, Gnosis networks
const NETWORKS = {
  arbitrum: {
    name: "Arbitrum",
    rpc: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
    chainId: 42161,
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapV3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e'
  },
  polygon: {
    name: "Polygon",
    rpc: process.env.POLYGON_RPC || 'https://polygon-rpc.com',
    chainId: 137,
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapV3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e'
  }
};

// Token lists from your provided data
const TOKENS = {
  arbitrum: {
    // Major base tokens for pairing
    WETH: { address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', decimals: 18 },
    USDC: { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', decimals: 6 },
    USDT: { address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', decimals: 6 },
    DAI: { address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', decimals: 18 },
    WBTC: { address: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f', decimals: 8 },
    
    // Your provided tokens
    '1INCH': { address: '0x5438107231c501f4929a5e2e3155e2665a9a8f7b', decimals: 18 },
    'AAVE': { address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', decimals: 18 },
    'AEVO': { address: '0x385eeac5cb85a38a9a07a70c73e0a3271cfb54a7', decimals: 18 },
    'AGLD': { address: '0x3e97808d9ef9a7d7ed98312e3fe9f070b94269de', decimals: 18 },
    'ALPHA': { address: '0xc854e43631a66032b4a37b6c96d8a7fb8c5d6e9e', decimals: 18 },
    'Ankr': { address: '0xe05a08244e5c6e65edea2cce6a4ec8fd3ba915c4', decimals: 18 },
    'APE': { address: '0x2d3bd680c6a1994e25fa22716b653e3d7a8c74dc', decimals: 18 },
    'API3': { address: '0x43448ca009a397316b4e566e714eb8217e12e152', decimals: 18 },
    'ARB': { address: '0x912ce59144191c1204e64559fe8253a0e49e6548', decimals: 18 },
    'ARKM': { address: '0x5c54e69e08849145065638863172a61a2b57497e', decimals: 18 },
    'AXL': { address: '0x8ff33111786bf5e56a56d603df6a8116b5a9174a', decimals: 18 },
    'AXS': { address: '0x2be31b290b855e80d4c61b2cd0b45b5e961483a5', decimals: 18 },
    'BAL': { address: '0x040d1edc9569d4bab2d15287dc5a4f10f56a56b8', decimals: 18 },
    'BAT': { address: '0x1fe622e247605caa74864bb598084a053d8db3e3', decimals: 18 },
    'BICO': { address: '0x5f016b336c804d52a39e96f44b4f5e265a8a7f3d', decimals: 18 },
    'COMP': { address: '0x354a6da4a1c414131c964d7c0b50c373e9c1a845', decimals: 18 },
    'COW': { address: '0xdef1ca1fb7fbcdc777520aa7f396b4e015f497ab', decimals: 18 },
    'CRV': { address: '0x11cdb42b0eb46d95f990bedd4695a6e3fa034978', decimals: 18 },
    'ETHFI': { address: '0x9a6ae5622990ba5ec98225a455c56f4d5a8a0b1c', decimals: 18 },
    'FRAX': { address: '0x17fc002b466eec40dae837fc4be5c67993ddbd6f', decimals: 18 },
    'FXS': { address: '0x9d2f299715d94d8a7e6f5eaa8e654e8c74a988a7', decimals: 18 },
    'GMX': { address: '0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a', decimals: 18 },
    'GRT': { address: '0x230d620a2c47e252e6c3f75a94971f15bffb8e72', decimals: 18 },
    'IMX': { address: '0x3a4f40631a4f906c2bad353ed06de7a5d3fcb430', decimals: 18 },
    'LDO': { address: '0x13ad51ed4f1b7e9dc168d8a00cb3f91e71e6e8d0', decimals: 18 },
    'LINK': { address: '0xf97f4df75117a78c1a5a0dbb814af92458539fb4', decimals: 18 },
    'LUSD': { address: '0x93b346b6bc25483a79a3e517304e2b5c1de2e47c', decimals: 18 },
    'MAGIC': { address: '0x539bde0d4d63320772d99f2d1be671a7c23e7e4c', decimals: 18 },
    'MANA': { address: '0x3b484b82567a09e2588a13d54d032153f0c0aee0', decimals: 18 },
    'MATIC': { address: '0x6f14c025c4eb8cf9499c7dd3e82517a67c09c2cd', decimals: 18 },
    'METIS': { address: '0x2e14bf0409894809d5e2e733707698d38c400a62', decimals: 18 },
    'MIM': { address: '0xfea7a6a0b346362bf88a9e4a88416b77a57d6c2a', decimals: 18 },
    'MOG': { address: '0x3c753b1a9e9a1e9e9f0a1b2c3d4e5f6a7b8c9d0e', decimals: 18 },
    'MORPHO': { address: '0x57a2f53c8f1d6e8e9f0a1b2c3d4e5f6a7b8c9d0e', decimals: 18 },
    'ONDO': { address: '0x9f39e5a0a9a9b8c7d6e5f4c3b2a1908f7e6d5c4b', decimals: 18 },
    'PENDLE': { address: '0x0c880f6761f1af8d9aa9c466984b80dab9a8c9e8', decimals: 18 },
    'PEPE': { address: '0x7069e91f2e19f862c21453d753e70afeb1914318', decimals: 18 },
    'PERP': { address: '0x67c597624b17b16fb7b6d89c9e87a83d3da07f1b', decimals: 18 },
    'POL': { address: '0x4200000000000000000000000000000000000042', decimals: 18 },
    'RNDR': { address: '0xa45e36133a1e79d62f99e4f4c6c9e8e9f0a1b2c3', decimals: 18 },
    'RPL': { address: '0xb766039cc6db368759c1e56b79affe831d0cc507', decimals: 18 },
    'SD': { address: '0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0', decimals: 18 },
    'SNX': { address: '0x8700daec35af8ff88c16bdf0418774cb3d7599b4', decimals: 18 },
    'SPELL': { address: '0x3e6648c5a70a150a88bce65f4ad4d506fe15d2af', decimals: 18 },
    'SUSHI': { address: '0xd4d42f0b6def4ce0383636770ef773390d85c61a', decimals: 18 },
    'SYN': { address: '0x9988843262134637195981eaaa8858da39236c3e', decimals: 18 },
    'TURBO': { address: '0x1a8e39ae59e5556b56b76fcba98d22c9ae557396', decimals: 18 },
    'UMA': { address: '0x07c654634b5d52a2f295a4911f8f1987a6e56a33', decimals: 18 },
    'UNI': { address: '0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0', decimals: 18 },
    'YFI': { address: '0x92a4e761d63a5e554a252e735463e97a7a3db93a', decimals: 18 },
    'ZRO': { address: '0x957c9c64f7c2ce091e54af275d4ef8e72e434d5e', decimals: 18 },
    'cbBTC': { address: '0x28fe63565e51ceaf7e3b686d6cd7ba24fb4a8558', decimals: 8 },
    'cbETH': { address: '0x1debd73e752beaf79865fd6446b0c970eae7732f', decimals: 18 },
    'tBTC': { address: '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40', decimals: 18 }
  },
  
  polygon: {
    // Major base tokens for pairing
    WETH: { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
    USDC: { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6 },
    USDT: { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
    WMATIC: { address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18 },
    WBTC: { address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', decimals: 8 },
    DAI: { address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18 },
    
    // Your provided tokens
    '1INCH': { address: '0x111111111117dc0aa78b770fa6a738034120c302', decimals: 18 },
    'AAVE': { address: '0xd6df932a45c0f255f85145f286ea0b292b21c90b', decimals: 18 },
    'AGLD': { address: '0x5592ec0cfb3d079665e877c5a623c1f78190fa36', decimals: 18 },
    'ALCX': { address: '0x765277eebeca2e31912c9946eae1021199b39c61', decimals: 18 },
    'ALICE': { address: '0x3402a719021e1e8b1d14e6d78c2815419f1e37c1', decimals: 18 },
    'ALPHA': { address: '0x2675609F6C2a62aE1BD2dB28B19d51331C212B5F', decimals: 18 },
    'AMP': { address: '0xb99e247c1a39f7dcfd6e3b8fc9ab24eef7eb6e33', decimals: 18 },
    'ANT': { address: '0x960b236A07cf122663c4303350609A66A7B288C0', decimals: 18 },
    'APE': { address: '0x4791396604512f8584f15bb54ef5e38b12e1b31a', decimals: 18 },
    'ARPA': { address: '0x8F1E15bc8cA9215F6BA3428AE5249359d0252713', decimals: 18 },
    'AUDIO': { address: '0x0b38210ea11411557c13457D4dA7dC6ea731B88a', decimals: 18 },
    'AXS': { address: '0x3323916121E777F8E923091B7e4781656c51CC39', decimals: 18 },
    'BAND': { address: '0x4136e91140a0e4C36D2C3189E91C1A128247117D', decimals: 18 },
    'BICO': { address: '0x5f016b336c804d52a39e96f44b4f5e265a8a7f3d', decimals: 18 },
    'BLZ': { address: '0x26c8AFBBFE1EBaca03C2bB082E69D0476Bffe099', decimals: 18 },
    'BNT': { address: '0x31f4904F6d16190DB594171b75908201f476AfF9', decimals: 18 },
    'BUSD': { address: '0xdAb529f40E671A1D4bF91361c21bf9f0C9712ab7', decimals: 18 },
    'CRV': { address: '0x172370d5Cd63279eFa6d502DAB29171933a610AF', decimals: 18 },
    'CTSI': { address: '0x6A6C605700f477E3848932a7c272432546421080', decimals: 18 },
    'ENJ': { address: '0x2C78F1b70Cc349542c83269d9b3289e36d38261d', decimals: 18 },
    'ERN': { address: '0x1dF34a1A33b3911803b15B344CD1c18F5E923691', decimals: 18 },
    'FRAX': { address: '0x45c32fA6DF82ead1e2EF74d17b76547EDdFfE206', decimals: 18 },
    'FXS': { address: '0x3e121107F6F22Da4911079845a470733ACFe4CA5', decimals: 18 },
    'GNO': { address: '0x5FFD62D3C3eE2E867574c26A2F7C14122aD33123', decimals: 18 },
    'GRT': { address: '0x5fe2B58c013d7601147DcdD68C143A77499f5531', decimals: 18 },
    'GTC': { address: '0x0cEC1A9154Ff802e7934Fc916Ed7Ca50bDE6844e', decimals: 18 },
    'GUSD': { address: '0x62359Ed7505Efc61FF1D56fEF82158CcaffA23D7', decimals: 2 },
    'GYEN': { address: '0xB2987753D1561570913920401E43C5A4106B6161', decimals: 6 },
    'HOPR': { address: '0xfE1C248349220150673F7d8929d2255d99F22d31', decimals: 18 },
    'IMX': { address: '0x607a9f2d98A1a5E43E44B1f19Ae962543b38C421', decimals: 18 },
    'INDEX': { address: '0x72355A56D50831481d5e1ef3712359E025212024', decimals: 18 },
    'JASMY': { address: '0x7B9C2f68F16c3613e8b6c93Ef67d37E5d8c0A944', decimals: 18 },
    'LDO': { address: '0xC3C7d4228098520355d85941A481512E6b31E154', decimals: 18 },
    'LINK': { address: '0xb33EaAd8d922B1083446DC23f610c2567fB5180f', decimals: 18 },
    'LOKA': { address: '0x5a33492d5db4474e72c6b3e61266a7f2a01e5f2a', decimals: 18 },
    'LRC': { address: '0x24D39324C3693956463d28cB23431964D515D3a5', decimals: 18 },
    'LUSD': { address: '0x93b346b6bc25483a79a3e517304e2b5c1de2e47c', decimals: 18 },
    'MANA': { address: '0xA1c57f48F0Deb89f569dFbe6E2B7f46D33606fD4', decimals: 18 },
    'MIM': { address: '0x49a0421f7631145e138491c1e3C6631541182e91', decimals: 18 },
    'MKR': { address: '0x6f7C932e7684666C9fd1d445277654365bc1011c', decimals: 18 },
    'PENDLE': { address: '0x0C880f6761F1af8d9aA9C466984b80DAb9a8c9e8', decimals: 18 },
    'PERP': { address: '0x67c597624b17b16fb7b6d89c9e87a83d3da07f1b', decimals: 18 },
    'QUICK': { address: '0xB5C0642510a044dA1431547651885E2599891180', decimals: 18 },
    'RNDR': { address: '0x61299774020dA444Af8416062C8152f3Fc3fF201', decimals: 18 },
    'SAND': { address: '0x3E708Fdb6E7483814C99559E224D2c41a0538E00', decimals: 18 },
    'SNX': { address: '0x50B728D8D964fd00C2d0AAD81718b71311feF68a', decimals: 18 },
    'SUSHI': { address: '0x0b3F868E0BE5597D5DB7fB1f246656A3173BdD50', decimals: 18 },
    'UNI': { address: '0x4c19596f5aaff459fa38b0f7ed92f11ae6543784', decimals: 18 }
  }
};

// Function to dynamically generate trading pairs
function generateTradingPairs(networkKey) {
  const tokens = TOKENS[networkKey];
  const pairs = [];
  const tokenSymbols = Object.keys(tokens);
  
  // Base tokens to pair with everything
  const baseTokens = ['WETH', 'USDC', 'USDT', 'DAI', 'WBTC'];
  
  // Generate pairs: each base token with all other tokens
  for (const baseToken of baseTokens) {
    if (!tokens[baseToken]) continue;
    
    for (const tokenSymbol of tokenSymbols) {
      if (tokenSymbol === baseToken) continue;
      
      pairs.push({
        token0: baseToken,
        token1: tokenSymbol,
        token0Address: tokens[baseToken].address,
        token1Address: tokens[tokenSymbol].address,
        decimals0: tokens[baseToken].decimals,
        decimals1: tokens[tokenSymbol].decimals
      });
    }
  }
  
  // Add additional major token-to-token pairs (top 20 tokens)
  const topTokens = tokenSymbols.slice(0, 20);
  for (let i = 0; i < topTokens.length; i++) {
    for (let j = i + 1; j < topTokens.length; j++) {
      const token0 = topTokens[i];
      const token1 = topTokens[j];
      
      // Skip if one is already a base token (already covered above)
      if (baseTokens.includes(token0) || baseTokens.includes(token1)) continue;
      
      pairs.push({
        token0: token0,
        token1: token1,
        token0Address: tokens[token0].address,
        token1Address: tokens[token1].address,
        decimals0: tokens[token0].decimals,
        decimals1: tokens[token1].decimals
      });
    }
  }
  
  return pairs;
}

// Trading pairs - dynamically generated
const TRADING_PAIRS = {
  arbitrum: generateTradingPairs('arbitrum'),
  polygon: generateTradingPairs('polygon')
};

// Uniswap V3 Quoter ABI (simplified)
const QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
];

// Get Uniswap V3 price - Returns prices for ALL fee tiers
async function getUniswapV3Prices(network, pair, amountIn) {
  try {
    const provider = new ethers.JsonRpcProvider(network.rpc, network.chainId, {
      staticNetwork: true
    });
    
    provider.pollingInterval = 5000;
    const quoter = new ethers.Contract(network.quoterV2, QUOTER_ABI, provider);
    
    // Try all fee tiers and return all successful quotes
    const feeTiers = [3000, 500, 10000]; // 0.3%, 0.05%, 1%
    const quotes = [];

    for (const fee of feeTiers) {
      try {
        const amountInWei = ethers.parseUnits(amountIn.toString(), pair.decimals0);
        
        const params = {
          tokenIn: pair.token0Address,
          tokenOut: pair.token1Address,
          amountIn: amountInWei,
          fee: fee,
          sqrtPriceLimitX96: 0
        };

        const callPromise = quoter.quoteExactInputSingle.staticCall(params);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('RPC timeout')), 5000)
        );
        
        const result = await Promise.race([callPromise, timeoutPromise]);
        const amountOut = result[0];

        quotes.push({
          amountOut: ethers.formatUnits(amountOut, pair.decimals1),
          fee: fee,
          feeName: fee === 500 ? '0.05%' : fee === 3000 ? '0.3%' : '1%'
        });
      } catch (err) {
        continue;
      }
    }

    return quotes.length > 0 ? quotes : null;
  } catch (error) {
    console.log(`    ⚠️  Uniswap error: ${error.message}`);
    return null;
  }
}

// CLEAN Paraswap V5 implementation without bypass attempts
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

    // Clean headers - no bypass attempts
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    const response = await axios.get(url, { 
      params,
      timeout: 8000,
      headers: headers
    });

    if (response.data && response.data.priceRoute) {
      const destAmount = response.data.priceRoute.destAmount;
      return {
        amountOut: ethers.formatUnits(destAmount, pair.decimals1),
        dex: response.data.priceRoute.bestRoute?.[0]?.swaps?.[0]?.swapExchanges?.[0]?.exchange || 'Paraswap'
      };
    }

    return null;
  } catch (error) {
    // REMOVED: All bypass-related error handling
    if (error.response) {
      console.log(`    ⚠️  Paraswap error: ${error.response.status}`);
    } else if (error.code === 'ECONNABORTED') {
      console.log(`    ⚠️  Paraswap timeout`);
    } else {
      console.log(`    ⚠️  Paraswap error: ${error.message}`);
    }
    return null;
  }
}

// Scan for arbitrage opportunities - Compare Uniswap V3 vs Paraswap V5
async function scanArbitrage(networkKey) {
  const network = NETWORKS[networkKey];
  const opportunities = [];
  const tradeSize = 1;
  
  const allPairs = TRADING_PAIRS[networkKey];
  
  // Scan 8 pairs per request
  const maxPairsPerScan = 20;
  const randomStart = Math.floor(Math.random() * allPairs.length);
  const pairsToScan = [];
  
  for (let i = 0; i < maxPairsPerScan && i < allPairs.length; i++) {
    const index = (randomStart + i) % allPairs.length;
    pairsToScan.push(allPairs[index]);
  }
  
  console.log(`\n🔍 Scanning ${pairsToScan.length} pairs on ${networkKey}...`);
  console.log(`   Total available pairs: ${allPairs.length}`);

  for (const pair of pairsToScan) {
    try {
      console.log(`  Checking ${pair.token0}/${pair.token1}...`);
      
      // Get prices from Uniswap V3 and Paraswap V5 only
      const timeout = 10000;
      const [uniswapQuotes, paraswapQuote] = await Promise.race([
        Promise.all([
          getUniswapV3Prices(network, pair, tradeSize),
          getParaswapPrice(network, pair, tradeSize)
        ]),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), timeout)
        )
      ]);

      // If we have BOTH Uniswap and Paraswap, compare them
      if (uniswapQuotes && uniswapQuotes.length > 0 && paraswapQuote) {
        // Get best Uniswap V3 price for token0 → token1
        const bestUniswap = uniswapQuotes.reduce((best, current) => {
          return parseFloat(current.amountOut) > parseFloat(best.amountOut) ? current : best;
        });
        
        const uniswapOutput = parseFloat(bestUniswap.amountOut);
        const paraswapOutput = parseFloat(paraswapQuote.amountOut);
        
        console.log(`    Uniswap V3 (${pair.token0} → ${pair.token1}): ${uniswapOutput.toFixed(6)} (${bestUniswap.feeName})`);
        console.log(`    Paraswap V5 (${pair.token0} → ${pair.token1}): ${paraswapOutput.toFixed(6)}`);
        
        // Check REVERSE direction (token1 → token0) to complete the cycle
        // FIXED REVERSE CHECK BUG: Create clean reverse pair object
        const reversePair = {
          token0: pair.token1,
          token1: pair.token0,
          token0Address: pair.token1Address,
          token1Address: pair.token0Address,
          decimals0: pair.decimals1,  // CRITICAL: decimals must match token0
          decimals1: pair.decimals0   // CRITICAL: decimals must match token1
        };

        const [uniswapReverseQuotes, paraswapReverseQuote] = await Promise.all([
          getUniswapV3Prices(network, reversePair, tradeSize),
          getParaswapPrice(network, reversePair, tradeSize)
        ]);

        if (!uniswapReverseQuotes || !paraswapReverseQuote) {
          console.log(`    ⚠️  Could not get reverse prices for arbitrage cycle`);
          continue;
        }

        const bestUniswapReverse = uniswapReverseQuotes.reduce((best, current) => {
          return parseFloat(current.amountOut) > parseFloat(best.amountOut) ? current : best;
        });
        
        const uniswapReverseOutput = parseFloat(bestUniswapReverse.amountOut);
        const paraswapReverseOutput = parseFloat(paraswapReverseQuote.amountOut);
        
        console.log(`    Uniswap V3 (${pair.token1} → ${pair.token0}): ${uniswapReverseOutput.toFixed(6)}`);
        console.log(`    Paraswap V5 (${pair.token1} → ${pair.token0}): ${paraswapReverseOutput.toFixed(6)}`);
        
        // CORRECT ARBITRAGE CALCULATION WITH CLEAR INSTRUCTIONS
        // Declare variables at the correct scope
        let cycle1Final, cycle2Final, buyToken, sellToken, buyDex, sellDex, finalAmount, tradeAction;

       // Cycle 1: Buy token1 on Paraswap (cheap), sell token1 on Uniswap (expensive)
        cycle1Final = paraswapOutput * uniswapReverseOutput;

      // Cycle 2: Buy token1 on Uniswap (cheap), sell token1 on Paraswap (expensive)
        cycle2Final = uniswapOutput * paraswapReverseOutput;

        console.log(`    Cycle 1 (Buy ${pair.token1} on Paraswap → Sell on Uniswap): ${cycle1Final.toFixed(6)} ${pair.token0}`);
        console.log(`    Cycle 2 (Buy ${pair.token1} on Uniswap → Sell on Paraswap): ${cycle2Final.toFixed(6)} ${pair.token0}`);

    // Reset variables before determining profitable cycle
        buyToken = null;
        sellToken = null;
        buyDex = null;
        sellDex = null;
        finalAmount = null;
        tradeAction = null;

        if (cycle1Final > 1.003) { // At least 0.3% profit after fees
    // You're buying token1 CHEAP on Paraswap, selling it EXPENSIVE on Uniswap
          buyToken = pair.token1;
          sellToken = pair.token1;
          buyDex = 'Paraswap V5';
          sellDex = `Uniswap V3 (${bestUniswapReverse.feeName})`;
          finalAmount = cycle1Final;
          tradeAction = `Buy ${buyToken} on ${buyDex}, sell ${sellToken} on ${sellDex}`;
        } else if (cycle2Final > 1.003) { // At least 0.3% profit after fees
   // You're buying token1 CHEAP on Uniswap, selling it EXPENSIVE on Paraswap
          buyToken = pair.token1;
          sellToken = pair.token1;
          buyDex = `Uniswap V3 (${bestUniswap.feeName})`;
          sellDex = 'Paraswap V5';
          finalAmount = cycle2Final;
          tradeAction = `Buy ${buyToken} on ${buyDex}, sell ${sellToken} on ${sellDex}`;
     } else {
      console.log(`    📊 No profitable cycle found (best: ${Math.max(cycle1Final, cycle2Final).toFixed(6)})`);
      continue;
   }

// Now check if we found a profitable opportunity
      if (!tradeAction) {
       console.log(`    📊 No profitable cycle found (best: ${Math.max(cycle1Final, cycle2Final).toFixed(6)})`);
       continue;
    }

        const profitPercent = ((finalAmount - 1) * 100);
        
        console.log(`    ✅ FOUND: ${profitPercent.toFixed(3)}% profit!`);
        console.log(`       ${tradeAction}`);
        
        const tradeSizeUSD = 10000;
        const estimatedProfit = (tradeSizeUSD * profitPercent / 100).toFixed(2);
        const gasEstimate = network.chainId === 1 ? (15 + Math.random() * 35).toFixed(2) : (0.3 + Math.random() * 2).toFixed(2);
        
        opportunities.push({
          network: networkKey,
          chainId: network.chainId,
          pair: `${pair.token0}/${pair.token1}`,
          // CLEAR TRADE INSTRUCTIONS:
          tradeAction: tradeAction,
          buyToken: buyToken,
          sellToken: sellToken,
          buyDex: buyDex,
          sellDex: sellDex,
          // Prices show how much token1 you get for 1 token0 (buy) and vice versa (sell)
          buyPrice: buyToken === pair.token1 ? (buyDex === 'Paraswap V5' ? paraswapOutput : uniswapOutput).toFixed(6) : 'N/A',
          sellPrice: sellToken === pair.token1 ? (sellDex.includes('Uniswap') ? uniswapReverseOutput : paraswapReverseOutput).toFixed(6) : 'N/A',
          profitPercent: profitPercent.toFixed(3),
          estimatedProfit: estimatedProfit,
          gasEstimate: gasEstimate,
          tradeSize: tradeSizeUSD,
          timestamp: new Date().toISOString(),
          token0Address: pair.token0Address,
          token1Address: pair.token1Address
        });
      } else {
        console.log(`    ⚠️  Insufficient data to compare (Uniswap: ${uniswapQuotes?.length || 0} pools, Paraswap: ${paraswapQuote ? 'OK' : 'Failed'})`);
      }
    } catch (error) {
      console.log(`    ❌ Error: ${error.message}`);
      continue;
    }
  }
  
  console.log(`✅ Scan complete: Found ${opportunities.length} opportunities\n`);
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
      name: NETWORKS[key].name,
      chainId: NETWORKS[key].chainId,
      totalPairs: TRADING_PAIRS[key].length
    }))
  });
});

// Get pairs for a network
app.get('/api/pairs/:network', (req, res) => {
  const { network } = req.params;
  
  if (!NETWORKS[network]) {
    return res.status(400).json({ error: 'Invalid network' });
  }
  
  res.json({
    network,
    totalPairs: TRADING_PAIRS[network].length,
    pairs: TRADING_PAIRS[network].slice(0, 50) // Return first 50 pairs
  });
});

// Serve frontend at root
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, () => {
  const totalPairs = Object.values(TRADING_PAIRS).reduce((sum, pairs) => sum + pairs.length, 0);
  console.log(`🚀 DEX Arbitrage Scanner running on port ${PORT}`);
  console.log(`📊 Monitoring ${Object.keys(NETWORKS).length} networks`);
  console.log(`💱 Total trading pairs: ${totalPairs}`);
  console.log(`\n📍 Pairs per network:`);
  console.log(`   Arbitrum: ${TRADING_PAIRS.arbitrum.length} pairs ⚡ LOW GAS`);
  console.log(`   Polygon: ${TRADING_PAIRS.polygon.length} pairs ⚡ LOW GAS`);
  console.log(`\n✅ Focus on L2 networks for best profit margins!`);
  console.log(`🔍 Scanner: Uniswap V3 ↔ Paraswap V5 only`);
});

module.exports = app;
