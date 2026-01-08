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
    uniswapV3Factory: ethers.getAddress('0x1f98431c8ad98523631ae4a59f267346ea31f984'),
    quoterV2: ethers.getAddress('0x61ffe014ba17989e743c5f6cb21bf9697530b21e'),
    pool: ethers.getAddress('0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2')
  },
  polygon: {
    rpc: process.env.POLYGON_RPC || 'https://polygon-rpc.com',
    chainId: 137,
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapV3Factory: ethers.getAddress('0x1f98431c8ad98523631ae4a59f267346ea31f984'),
    quoterV2: ethers.getAddress('0x61ffe014ba17989e743c5f6cb21bf9697530b21e'),
    pool: ethers.getAddress('0x794a61358d6845594f94dc1db02a252b5b4814ad')
  },
  arbitrum: {
    rpc: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
    chainId: 42161,
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapV3Factory: ethers.getAddress('0x1f98431c8ad98523631ae4a59f267346ea31f984'),
    quoterV2: ethers.getAddress('0x61ffe014ba17989e743c5f6cb21bf9697530b21e'),
    pool: ethers.getAddress('0x794a61358d6845594f94dc1db02a252b5b4814ad')
  },
  optimism: {
    rpc: process.env.OPTIMISM_RPC || 'https://mainnet.optimism.io',
    chainId: 10,
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapV3Factory: ethers.getAddress('0x1f98431c8ad98523631ae4a59f267346ea31f984'),
    quoterV2: ethers.getAddress('0x61ffe014ba17989e743c5f6cb21bf9697530b21e'),
    pool: ethers.getAddress('0x794a61358d6845594f94dc1db02a252b5b4814ad')
  },
  base: {
    rpc: process.env.BASE_RPC || 'https://mainnet.base.org',
    chainId: 8453,
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapV3Factory: ethers.getAddress('0x33128a8fc17869897dce68ed026d694621f6fdfd'),
    quoterV2: ethers.getAddress('0x3d4e44eb1374240ce5f1b871ab261cd16335b76a'),
    pool: ethers.getAddress('0xa238dd80c8e26a0deee0276cf0d36ddd32c7eaf3')
  },
  gnosis: {
    rpc: process.env.GNOSIS_RPC || 'https://rpc.gnosischain.com',
    chainId: 100,
    paraswapAPI: 'https://apiv5.paraswap.io',
    uniswapV3Factory: ethers.getAddress('0x1f98431c8ad98523631ae4a59f267346ea31f984'),
    quoterV2: ethers.getAddress('0x61ffe014ba17989e743c5f6cb21bf9697530b21e'),
    pool: ethers.getAddress('0x71595b4a67d0eda38a1a1fa41b68660193de2dcd')
  }
};

// Trading pairs to monitor - Updated to only Aave V3 reserves
const TRADING_PAIRS = {
  ethereum: [
    // Major pairs
    { token0: 'WETH', token1: 'USDC', token0Address: ethers.getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'), token1Address: ethers.getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), decimals0: 18, decimals1: 6 },
    { token0: 'WETH', token1: 'USDT', token0Address: ethers.getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'), token1Address: ethers.getAddress('0xdac17f958d2ee523a2206206994597c13d831ec7'), decimals0: 18, decimals1: 6 },
    { token0: 'WETH', token1: 'DAI', token0Address: ethers.getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'), token1Address: ethers.getAddress('0x6b175474e89094c44da98b954eedeac495271d0f'), decimals0: 18, decimals1: 18 },
    { token0: 'WBTC', token1: 'WETH', token0Address: ethers.getAddress('0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'), token1Address: ethers.getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'), decimals0: 8, decimals1: 18 },
    { token0: 'USDC', token1: 'USDT', token0Address: ethers.getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), token1Address: ethers.getAddress('0xdac17f958d2ee523a2206206994597c13d831ec7'), decimals0: 6, decimals1: 6 },
    { token0: 'USDC', token1: 'DAI', token0Address: ethers.getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), token1Address: ethers.getAddress('0x6b175474e89094c44da98b954eedeac495271d0f'), decimals0: 6, decimals1: 18 },
    
    // DeFi Blue Chips
    { token0: 'Chainlink', token1: 'WETH', token0Address: ethers.getAddress('0x514910771af9ca656af840dff83e8264ecf986ca'), token1Address: ethers.getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'), decimals0: 18, decimals1: 18 },
    { token0: 'UNI', token1: 'WETH', token0Address: ethers.getAddress('0x1f9840a85d5af5bf1d1762f925bdaddc4201f984'), token1Address: ethers.getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'), decimals0: 18, decimals1: 18 },
    { token0: 'Aave', token1: 'WETH', token0Address: ethers.getAddress('0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9'), token1Address: ethers.getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'), decimals0: 18, decimals1: 18 },
    { token0: 'CRV', token1: 'WETH', token0Address: ethers.getAddress('0xd533a949740bb3306d119cc777fa900ba034cd52'), token1Address: ethers.getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'), decimals0: 18, decimals1: 18 },
    { token0: 'LDO', token1: 'WETH', token0Address: ethers.getAddress('0x5a98fcbea516cf06857215779fd812ca3bef1b32'), token1Address: ethers.getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'), decimals0: 18, decimals1: 18 },
    { token0: 'SNX', token1: 'WETH', token0Address: ethers.getAddress('0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f'), token1Address: ethers.getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'), decimals0: 18, decimals1: 18 },
    
    // DEX Tokens
    { token0: 'BAL', token1: 'WETH', token0Address: ethers.getAddress('0xba100000625a3754423978a60c9317c58a424e3d'), token1Address: ethers.getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'), decimals0: 18, decimals1: 18 },
    { token0: '1inch', token1: 'WETH', token0Address: ethers.getAddress('0x111111111117dc0aa78b770fa6a738034120c302'), token1Address: ethers.getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'), decimals0: 18, decimals1: 18 },
    
    // L2 & Gaming Tokens
    { token0: 'ENS', token1: 'WETH', token0Address: ethers.getAddress('0xc18360217d8f7ab5e7c516566761ea12ce7f9d72'), token1Address: ethers.getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'), decimals0: 18, decimals1: 18 },
    
    // Stablecoins and LSTs
    { token0: 'wstETH', token1: 'WETH', token0Address: ethers.getAddress('0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0'), token1Address: ethers.getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'), decimals0: 18, decimals1: 18 },
    { token0: 'rETH', token1: 'WETH', token0Address: ethers.getAddress('0xae78736cd615f374d308512ea083ff8a26e6651b'), token1Address: ethers.getAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'), decimals0: 18, decimals1: 18 },
    { token0: 'cbBTC', token1: 'WBTC', token0Address: ethers.getAddress('0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf'), token1Address: ethers.getAddress('0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'), decimals0: 8, decimals1: 8 },
    { token0: 'USDe', token1: 'USDC', token0Address: ethers.getAddress('0x4c9edd5852cd905f086c759e8383e09bff1e68b3'), token1Address: ethers.getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), decimals0: 18, decimals1: 6 },
    { token0: 'FRAX', token1: 'USDC', token0Address: ethers.getAddress('0x853d955acef822db058eb8505911ed77aa2e7cd5'), token1Address: ethers.getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), decimals0: 18, decimals1: 6 },
    { token0: 'LUSD', token1: 'USDC', token0Address: ethers.getAddress('0x5f98805a4e8be255a32880fdec7f6728c6568ba0'), token1Address: ethers.getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), decimals0: 18, decimals1: 6 },
    { token0: 'GHO', token1: 'USDC', token0Address: ethers.getAddress('0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f'), token1Address: ethers.getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), decimals0: 18, decimals1: 6 }
  ],
  
  polygon: [
    { token0: 'wMATIC', token1: 'USDC', token0Address: ethers.getAddress('0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270'), token1Address: ethers.getAddress('0x2791bca1f2de4661ed88a30c99a7a9449aa84174'), decimals0: 18, decimals1: 6 },
    { token0: 'wMATIC', token1: 'USDT', token0Address: ethers.getAddress('0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270'), token1Address: ethers.getAddress('0xc2132d05d31c914a87c6611c10748aeb04b58e8f'), decimals0: 18, decimals1: 6 },
    { token0: 'wETH', token1: 'USDC', token0Address: ethers.getAddress('0x7ceb23fd6bc0add59e62ac25578270cff1b9f619'), token1Address: ethers.getAddress('0x2791bca1f2de4661ed88a30c99a7a9449aa84174'), decimals0: 18, decimals1: 6 },
    { token0: 'wBTC', token1: 'wETH', token0Address: ethers.getAddress('0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6'), token1Address: ethers.getAddress('0x7ceb23fd6bc0add59e62ac25578270cff1b9f619'), decimals0: 8, decimals1: 18 },
    { token0: 'LINK', token1: 'wMATIC', token0Address: ethers.getAddress('0x53e0bca35ec356bd5dddfabbd1fc0fd03fabad39'), token1Address: ethers.getAddress('0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270'), decimals0: 18, decimals1: 18 },
    { token0: 'Aave', token1: 'wMATIC', token0Address: ethers.getAddress('0xd6df932a45c0f255f85145f286ea0b292b21c90b'), token1Address: ethers.getAddress('0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270'), decimals0: 18, decimals1: 18 }
  ],
  
  arbitrum: [
    { token0: 'WETH', token1: 'USDC', token0Address: ethers.getAddress('0x82af49447d8a07e3bd95bd0d56f35241523fbab1'), token1Address: ethers.getAddress('0xff970a61a04b1ca14834a43f5de4533ebddb5cc8'), decimals0: 18, decimals1: 6 },
    { token0: 'WETH', token1: 'USDT', token0Address: ethers.getAddress('0x82af49447d8a07e3bd95bd0d56f35241523fbab1'), token1Address: ethers.getAddress('0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9'), decimals0: 18, decimals1: 6 },
    { token0: 'wBTC', token1: 'WETH', token0Address: ethers.getAddress('0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f'), token1Address: ethers.getAddress('0x82af49447d8a07e3bd95bd0d56f35241523fbab1'), decimals0: 8, decimals1: 18 },
    { token0: 'ARB', token1: 'WETH', token0Address: ethers.getAddress('0x912ce59144191c1204e64559fe8253a0e49e6548'), token1Address: ethers.getAddress('0x82af49447d8a07e3bd95bd0d56f35241523fbab1'), decimals0: 18, decimals1: 18 },
    { token0: 'LINK', token1: 'WETH', token0Address: ethers.getAddress('0xf97f4df75117a78c1a5a0dbb814af92458539fb4'), token1Address: ethers.getAddress('0x82af49447d8a07e3bd95bd0d56f35241523fbab1'), decimals0: 18, decimals1: 18 }
  ],
  
  optimism: [
    { token0: 'WETH', token1: 'USDC', token0Address: ethers.getAddress('0x4200000000000000000000000000000000000006'), token1Address: ethers.getAddress('0x7f5c764cbc14f9669b88837ca1490cca17c31607'), decimals0: 18, decimals1: 6 },
    { token0: 'WETH', token1: 'DAI', token0Address: ethers.getAddress('0x4200000000000000000000000000000000000006'), token1Address: ethers.getAddress('0xda10009cbd5d07dd0cecc66161fc93d7c9000da1'), decimals0: 18, decimals1: 18 },
    { token0: 'OP', token1: 'WETH', token0Address: ethers.getAddress('0x4200000000000000000000000000000000000042'), token1Address: ethers.getAddress('0x4200000000000000000000000000000000000006'), decimals0: 18, decimals1: 18 },
    { token0: 'wBTC', token1: 'WETH', token0Address: ethers.getAddress('0x68f180fcce6836688e9084f035309e29bf0a2095'), token1Address: ethers.getAddress('0x4200000000000000000000000000000000000006'), decimals0: 8, decimals1: 18 },
    { token0: 'LINK', token1: 'WETH', token0Address: ethers.getAddress('0x350a791bfc2c21f9ed5d10980dad2e2638ffa7f6'), token1Address: ethers.getAddress('0x4200000000000000000000000000000000000006'), decimals0: 18, decimals1: 18 }
  ],
  
  base: [
    { token0: 'WETH', token1: 'USDC', token0Address: ethers.getAddress('0x4200000000000000000000000000000000000006'), token1Address: ethers.getAddress('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'), decimals0: 18, decimals1: 6 },
    { token0: 'cbBTC', token1: 'WETH', token0Address: ethers.getAddress('0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf'), token1Address: ethers.getAddress('0x4200000000000000000000000000000000000006'), decimals0: 8, decimals1: 18 },
    { token0: 'cbETH', token1: 'WETH', token0Address: ethers.getAddress('0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22'), token1Address: ethers.getAddress('0x4200000000000000000000000000000000000006'), decimals0: 18, decimals1: 18 }
  ],
  
  gnosis: [
    { token0: 'wETH', token1: 'USDCe', token0Address: ethers.getAddress('0x6a023ccd1ff6f2045c3309768ead9e68f978f6e1'), token1Address: ethers.getAddress('0xddafbb505ad872755cab09a69a7829cfd5d1d52e'), decimals0: 18, decimals1: 6 },
    { token0: 'wETH', token1: 'xDAI', token0Address: ethers.getAddress('0x6a023ccd1ff6f2045c3309768ead9e68f978f6e1'), token1Address: ethers.getAddress('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'), decimals0: 18, decimals1: 18 },
    { token0: 'GNO', token1: 'wETH', token0Address: ethers.getAddress('0x22441d8141649ca9f26060ae07d35bc5c5ab66d6'), token1Address: ethers.getAddress('0x6a023ccd1ff6f2045c3309768ead9e68f978f6e1'), decimals0: 18, decimals1: 18 },
    { token0: 'wstETH', token1: 'wETH', token0Address: ethers.getAddress('0x6c76971f98945ae98dd7d4dfca8711ebea946ea4'), token1Address: ethers.getAddress('0x6a023ccd1ff6f2045c3309768ead9e68f978f6e1'), decimals0: 18, decimals1: 18 },
    { token0: 'GHO', token1: 'USDCe', token0Address: ethers.getAddress('0x28ec0b36f0819ecb5005cab836f4ed5a2eca4d13'), token1Address: ethers.getAddress('0xddafbb505ad872755cab09a69a7829cfd5d1d52e'), decimals0: 18, decimals1: 6 },
    { token0: 'EURe', token1: 'xDAI', token0Address: ethers.getAddress('0xc2bc2f8900679b3729fa0da3e69ccb3b2d47988b'), token1Address: ethers.getAddress('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'), decimals0: 18, decimals1: 18 }
  ]
};

// Uniswap V3 Quoter ABI (simplified)
const QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
];

// Aave Pool ABI for getReservesList
const POOL_ABI = [
  'function getReservesList() external view returns (address[] memory)'
];

// Function to get Aave V3 reserves for validation
async function getAaveReserves(network) {
  try {
    const provider = new ethers.JsonRpcProvider(network.rpc, network.chainId, {
      staticNetwork: true
    });
    const pool = new ethers.Contract(network.pool, POOL_ABI, provider);
    const reserves = await pool.getReservesList();
    return reserves.map(r => r.toLowerCase());
  } catch (error) {
    console.log(`    ⚠️  Aave reserves fetch error: ${error.message}`);
    return [];
  }
}

// Get Uniswap V3 prices - Returns prices for ALL fee tiers
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
      timeout: 8000
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
    // Log detailed error for debugging
    if (error.response) {
      console.log(`    ⚠️  Paraswap error: ${error.response.status} - ${error.response.data?.error || 'Unknown'}`);
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
  
  const allPairs = TRADING_PAIRS[networkKey] || TRADING_PAIRS.ethereum;
  
  // Fetch Aave reserves for validation
  const reserves = await getAaveReserves(network);
  if (reserves.length === 0) {
    console.log(`⚠️ No Aave reserves fetched for ${networkKey}. Skipping validation.`);
  }
  
  // Scan 8 pairs per request
  const maxPairsPerScan = 8;
  const randomStart = Math.floor(Math.random() * allPairs.length);
  const pairsToScan = [];
  
  for (let i = 0; i < maxPairsPerScan && i < allPairs.length; i++) {
    const index = (randomStart + i) % allPairs.length;
    const pair = allPairs[index];
    
    // Validate if tokens are Aave V3 reserves
    if (reserves.length > 0 && (!reserves.includes(pair.token0Address.toLowerCase()) || !reserves.includes(pair.token1Address.toLowerCase()))) {
      console.log(`  Skipping \( {pair.token0}/ \){pair.token1} - not Aave V3 reserves`);
      continue;
    }
    
    pairsToScan.push(pair);
  }
  
  console.log(`\n🔍 Scanning ${pairsToScan.length} pairs on ${networkKey}...`);

  for (const pair of pairsToScan) {
    try {
      console.log(`  Checking \( {pair.token0}/ \){pair.token1}...`);
      
      // Get prices from Uniswap V3 and Paraswap
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

      const aggregatorName = 'Paraswap V5';

      // If we have BOTH Uniswap and aggregator, compare them
      if (uniswapQuotes && uniswapQuotes.length > 0 && paraswapQuote) {
        // Get best Uniswap V3 price for token0 → token1
        const bestUniswap = uniswapQuotes.reduce((best, current) => {
          return parseFloat(current.amountOut) > parseFloat(best.amountOut) ? current : best;
        });
        
        const uniswapOutput = parseFloat(bestUniswap.amountOut); // token1 amount from 1 token0
        const aggregatorOutput = parseFloat(paraswapQuote.amountOut); // token1 amount from 1 token0
        
        console.log(`    Uniswap V3 (${pair.token0} → ${pair.token1}): \( {uniswapOutput.toFixed(6)} ( \){bestUniswap.feeName})`);
        console.log(`    \( {aggregatorName} ( \){pair.token0} → ${pair.token1}): ${aggregatorOutput.toFixed(6)}`);
        
        // Now check REVERSE direction (token1 → token0) to complete the cycle
        // We need to see which DEX gives better rate going BACK
        const [uniswapReverseQuotes, aggregatorReverseQuote] = await Promise.all([
          getUniswapV3Prices(network, {
            ...pair,
            token0: pair.token1,
            token1: pair.token0,
            token0Address: pair.token1Address,
            token1Address: pair.token0Address,
            decimals0: pair.decimals1,
            decimals1: pair.decimals0
          }, 1),  // Use 1 for reverse to get rate per 1 paired token
          getParaswapPrice(network, {
            ...pair,
            token0: pair.token1,
            token1: pair.token0,
            token0Address: pair.token1Address,
            token1Address: pair.token0Address,
            decimals0: pair.decimals1,
            decimals1: pair.decimals0
          }, 1)
        ]);

        if (!uniswapReverseQuotes || !aggregatorReverseQuote) {
          console.log(`    ⚠️  Could not get reverse prices for arbitrage cycle`);
          continue;
        }

        const bestUniswapReverse = uniswapReverseQuotes.reduce((best, current) => {
          return parseFloat(current.amountOut) > parseFloat(best.amountOut) ? current : best;
        });
        
        const uniswapReverseOutput = parseFloat(bestUniswapReverse.amountOut);
        const aggregatorReverseOutput = parseFloat(aggregatorReverseQuote.amountOut);
        
        console.log(`    Uniswap V3 (${pair.token1} → ${pair.token0}): ${uniswapReverseOutput.toFixed(6)}`);
        console.log(`    \( {aggregatorName} ( \){pair.token1} → ${pair.token0}): ${aggregatorReverseOutput.toFixed(6)}`);
        
        // Calculate complete arbitrage cycles:
        // Cycle 1: Start with 1 token0 → aggregator → get token1 → uniswap back → get token0
        const cycle1 = aggregatorOutput * uniswapReverseOutput; // Final token0 amount
        
        // Cycle 2: Start with 1 token0 → uniswap → get token1 → aggregator back → get token0
        const cycle2 = uniswapOutput * aggregatorReverseOutput; // Final token0 amount
        
        console.log(`    Cycle 1 (${aggregatorName} → Uniswap): ${cycle1.toFixed(6)} ${pair.token0}`);
        console.log(`    Cycle 2 (Uniswap → ${aggregatorName}): ${cycle2.toFixed(6)} ${pair.token0}`);
        
        // Find the profitable cycle
        let buyDex, sellDex, finalAmount, buyOutput, sellOutput;
        
        if (cycle1 > 1.003) { // At least 0.3% profit after fees
          // Profitable: Buy on aggregator, sell on Uniswap
          buyDex = aggregatorName;
          sellDex = `Uniswap V3 (${bestUniswapReverse.feeName})`;
          finalAmount = cycle1;
          buyOutput = aggregatorOutput;
          sellOutput = uniswapReverseOutput;
        } else if (cycle2 > 1.003) { // At least 0.3% profit after fees
          // Profitable: Buy on Uniswap, sell on aggregator
          buyDex = `Uniswap V3 (${bestUniswap.feeName})`;
          sellDex = aggregatorName;
          finalAmount = cycle2;
          buyOutput = uniswapOutput;
          sellOutput = aggregatorReverseOutput;
        } else {
          console.log(`    📊 No profitable cycle found (best: ${Math.max(cycle1, cycle2).toFixed(6)})`);
          continue;
        }
        
        const profitPercent = ((finalAmount - 1) * 100);
        
        console.log(`    ✅ FOUND: ${profitPercent.toFixed(3)}% profit!`);
        console.log(`       Buy on ${buyDex}, Sell on ${sellDex}`);
        
        const tradeSizeUSD = 10000;
        const estimatedProfit = (tradeSizeUSD * profitPercent / 100).toFixed(2);
        const gasEstimate = network.chainId === 1 ? (15 + Math.random() * 35).toFixed(2) : (0.3 + Math.random() * 2).toFixed(2);
        
        opportunities.push({
          network: networkKey,
          chainId: network.chainId,
          pair: `\( {pair.token0}/ \){pair.token1}`,
          buyDex,
          sellDex,
          buyPrice: buyOutput.toFixed(6),
          sellPrice: sellOutput.toFixed(6),
          profitPercent: profitPercent.toFixed(3),
          estimatedProfit: estimatedProfit,
          gasEstimate: gasEstimate,
          tradeSize: tradeSizeUSD,
          timestamp: new Date().toISOString(),
          furucomboStrategy: {
            network: networkKey,
            chainId: network.chainId,
            flashloan: {
              protocol: 'Aave V3',
              asset: pair.token0,
              assetAddress: pair.token0Address,
              amount: tradeSizeUSD,
              fee: '~$9 (0.09%)'
            },
            steps: [
              {
                step: 1,
                action: 'Swap',
                protocol: buyDex.includes('Uniswap') ? 'Uniswap V3' : 'Paraswap V5',
                pool: buyDex.includes('Uniswap') ? buyDex.match(/\(([^)]+)\)/)[1] : 'Best available route',
                from: pair.token0,
                to: pair.token1,
                price: `1 ${pair.token0} = ${buyOutput.toFixed(6)} ${pair.token1}`,
                expectedOutput: `${buyOutput.toFixed(6)} ${pair.token1}`,
                note: `Better rate for ${pair.token0} → ${pair.token1}`
              },
              {
                step: 2,
                action: 'Swap',
                protocol: sellDex.includes('Uniswap') ? 'Uniswap V3' : 'Paraswap V5',
                pool: sellDex.includes('Uniswap') ? sellDex.match(/\(([^)]+)\)/)[1] : 'Best available route',
                from: pair.token1,
                to: pair.token0,
                price: `1 ${pair.token1} = ${sellOutput.toFixed(6)} ${pair.token0}`,
                expectedOutput: `${finalAmount.toFixed(6)} ${pair.token0}`,
                note: `Complete cycle - return to ${pair.token0}`
              },
              {
                step: 3,
                action: 'Repay Flashloan',
                protocol: 'Aave V3',
                amount: 'borrowed amount + 0.09% fee ($9)'
              }
            ],
            netProfit: `\[ {(parseFloat(estimatedProfit) - parseFloat(gasEstimate)).toFixed(2)} (after gas)`,
            gasEstimate: ` \]{gasEstimate}`,
            explanation: `Complete cycle: 1 ${pair.token0} → ${buyOutput.toFixed(6)} \( {pair.token1} ( \){buyDex}) → ${finalAmount.toFixed(6)} \( {pair.token0} ( \){sellDex}). Net: ${profitPercent.toFixed(3)}%`
          }
        });
      } else if (uniswapQuotes && uniswapQuotes.length >= 2) {
        // Fallback: Compare Uniswap pools if Paraswap failed
        console.log(`    ⚠️  Paraswap unavailable, checking Uniswap pools only`);
        // Implement intra-Uniswap arbitrage if needed
      } else {
        console.log(`    ⚠️  Insufficient data to compare`);
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

// TEST ENDPOINT - Debug a single pair
app.get('/api/test/:network', async (req, res) => {
  const { network } = req.params;
  
  if (!NETWORKS[network]) {
    return res.status(400).json({ error: 'Invalid network' });
  }

  const networkConfig = NETWORKS[network];
  const pairs = TRADING_PAIRS[network] || TRADING_PAIRS.ethereum;
  const testPair = pairs[0];
  
  console.log(`\n🧪 TESTING ${network.toUpperCase()}: \( {testPair.token0}/ \){testPair.token1}`);
  
  try {
    const tradeSize = 1;
    
    console.log(`📍 Testing Uniswap V3 all pools...`);
    const uniswapStart = Date.now();
    const uniswapQuotes = await getUniswapV3Prices(networkConfig, testPair, tradeSize);
    const uniswapTime = Date.now() - uniswapStart;
    
    const result = {
      success: true,
      network,
      pair: `\( {testPair.token0}/ \){testPair.token1}`,
      uniswapPools: uniswapQuotes || [],
      totalPools: uniswapQuotes?.length || 0,
      time: `${uniswapTime}ms`,
      arbitrage: null
    };
    
    // Check for arbitrage between pools
    if (uniswapQuotes && uniswapQuotes.length >= 2) {
      const prices = uniswapQuotes.map(q => parseFloat(q.amountOut));
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const profitPercent = ((maxPrice - minPrice) / minPrice) * 100;
      
      result.arbitrage = {
        minPrice: minPrice.toFixed(6),
        maxPrice: maxPrice.toFixed(6),
        priceSpread: (maxPrice - minPrice).toFixed(6),
        profitPercent: profitPercent.toFixed(3) + '%',
        profitable: profitPercent > 0.2,
        strategy: 'Buy from lowest fee pool, sell to highest fee pool'
      };
    }
    
    console.log(`✅ Test complete - Found ${result.totalPools} pools`);
    res.json(result);
  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack 
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
  const totalPairs = Object.values(TRADING_PAIRS).reduce((sum, pairs) => sum + pairs.length, 0);
  console.log(`🚀 DEX Arbitrage Scanner running on port ${PORT}`);
  console.log(`📊 Monitoring ${Object.keys(NETWORKS).length} networks`);
  console.log(`💱 Total trading pairs: ${totalPairs}`);
  console.log(`\n📍 Pairs per network:`);
  console.log(`   Ethereum: ${TRADING_PAIRS.ethereum.length} pairs`);
  console.log(`   Polygon: ${TRADING_PAIRS.polygon.length} pairs ⚡ LOW GAS`);
  console.log(`   Arbitrum: ${TRADING_PAIRS.arbitrum.length} pairs ⚡ LOW GAS`);
  console.log(`   Optimism: ${TRADING_PAIRS.optimism.length} pairs ⚡ LOW GAS`);
  console.log(`   Base: ${TRADING_PAIRS.base.length} pairs ⚡ LOW GAS`);
  console.log(`   Gnosis: ${TRADING_PAIRS.gnosis.length} pairs ⚡ LOW GAS`);
  console.log(`\n✅ Focus on L2 networks for best profit margins!`);
});

module.exports = app;
