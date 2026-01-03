
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

// Trading pairs to monitor - Expanded list with more tokens
const TRADING_PAIRS = {
  ethereum: [
    // Major pairs
    { token0: 'WETH', token1: 'USDC', token0Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', token1Address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals0: 18, decimals1: 6 },
    { token0: 'WETH', token1: 'USDT', token0Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', token1Address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals0: 18, decimals1: 6 },
    { token0: 'WETH', token1: 'DAI', token0Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', token1Address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals0: 18, decimals1: 18 },
    { token0: 'WBTC', token1: 'WETH', token0Address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 8, decimals1: 18 },
    { token0: 'USDC', token1: 'USDT', token0Address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', token1Address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals0: 6, decimals1: 6 },
    { token0: 'USDC', token1: 'DAI', token0Address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', token1Address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals0: 6, decimals1: 18 },
    
    // DeFi Blue Chips
    { token0: 'LINK', token1: 'WETH', token0Address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    { token0: 'UNI', token1: 'WETH', token0Address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    { token0: 'AAVE', token1: 'WETH', token0Address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    { token0: 'MKR', token1: 'WETH', token0Address: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    { token0: 'CRV', token1: 'WETH', token0Address: '0xD533a949740bb3306d119CC777fa900bA034cd52', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    { token0: 'LDO', token1: 'WETH', token0Address: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    { token0: 'SNX', token1: 'WETH', token0Address: '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    
    // DEX Tokens
    { token0: 'SUSHI', token1: 'WETH', token0Address: '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    { token0: 'BAL', token1: 'WETH', token0Address: '0xba100000625a3754423978a60c9317c58a424e3D', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    { token0: 'COMP', token1: 'WETH', token0Address: '0xc00e94Cb662C3520282E6f5717214004A7f26888', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    { token0: '1INCH', token1: 'WETH', token0Address: '0x111111111117dC0aa78b770fA6A738034120C302', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    { token0: 'CVX', token1: 'WETH', token0Address: '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    
    // L2 & Gaming Tokens
    { token0: 'ENS', token1: 'WETH', token0Address: '0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    { token0: 'IMX', token1: 'WETH', token0Address: '0xF57e7e7C23978C3cAEC3C3548E3D615c346e79fF', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    { token0: 'GALA', token1: 'WETH', token0Address: '0xd1d2Eb1B1e90B638588728b4130137D262C87cae', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 8, decimals1: 18 },
    { token0: 'APE', token1: 'WETH', token0Address: '0x4d224452801ACEd8B2F0aebE155379bb5D594381', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    { token0: 'BLUR', token1: 'WETH', token0Address: '0x5283D291DBCF85356A21bA090E6db59121208b44', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    
    // Meme & New Tokens
    { token0: 'PEPE', token1: 'WETH', token0Address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    
    // Oracle & Data
    { token0: 'GRT', token1: 'WETH', token0Address: '0xc944E90C64B2c07662A292be6244BDf05Cda44a7', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    { token0: 'BAND', token1: 'WETH', token0Address: '0xBA11D00c5f74255f56a5E366F4F77f5A186d7f55', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    { token0: 'API3', token1: 'WETH', token0Address: '0x0b38210ea11411557c13457D4dA7dC6ea731B88a', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    
    // DeFi 2.0
    { token0: 'FXS', token1: 'WETH', token0Address: '0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    { token0: 'RNDR', token1: 'WETH', token0Address: '0x6De037ef9aD2725EB40118Bb1702EBb27e4Aeb24', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    { token0: 'FET', token1: 'WETH', token0Address: '0xaea46A60368A7bD060eec7DF8CBa43b7EF41Ad85', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    { token0: 'OCEAN', token1: 'WETH', token0Address: '0x967da4048cD07aB37855c090aAF366e4ce1b9F48', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    
    // Yield Tokens
    { token0: 'YFI', token1: 'WETH', token0Address: '0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    { token0: 'PENDLE', token1: 'WETH', token0Address: '0x808507121B80c02388fAd14726482e061B8da827', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    
    // Infrastructure
    { token0: 'ANKR', token1: 'WETH', token0Address: '0x8290333ceF9e6D528dD5618Fb97a76f268f3EDD4', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
    { token0: 'MATIC', token1: 'WETH', token0Address: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0', token1Address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals0: 18, decimals1: 18 },
  ],
  
  polygon: [
    { token0: 'WMATIC', token1: 'USDC', token0Address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', token1Address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals0: 18, decimals1: 6 },
    { token0: 'WMATIC', token1: 'USDT', token0Address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', token1Address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals0: 18, decimals1: 6 },
    { token0: 'WETH', token1: 'USDC', token0Address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', token1Address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals0: 18, decimals1: 6 },
    { token0: 'WBTC', token1: 'WETH', token0Address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', token1Address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals0: 8, decimals1: 18 },
    { token0: 'LINK', token1: 'WMATIC', token0Address: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39', token1Address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals0: 18, decimals1: 18 },
    { token0: 'AAVE', token1: 'WMATIC', token0Address: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B', token1Address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals0: 18, decimals1: 18 },
    { token0: 'CRV', token1: 'WMATIC', token0Address: '0x172370d5Cd63279eFa6d502DAB29171933a610AF', token1Address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals0: 18, decimals1: 18 },
  ],
  
  arbitrum: [
    { token0: 'WETH', token1: 'USDC', token0Address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', token1Address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', decimals0: 18, decimals1: 6 },
    { token0: 'WETH', token1: 'USDT', token0Address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', token1Address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals0: 18, decimals1: 6 },
    { token0: 'WBTC', token1: 'WETH', token0Address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', token1Address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals0: 8, decimals1: 18 },
    { token0: 'ARB', token1: 'WETH', token0Address: '0x912CE59144191C1204E64559FE8253a0e49E6548', token1Address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals0: 18, decimals1: 18 },
    { token0: 'GMX', token1: 'WETH', token0Address: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a', token1Address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals0: 18, decimals1: 18 },
    { token0: 'LINK', token1: 'WETH', token0Address: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4', token1Address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals0: 18, decimals1: 18 },
  ],
  
  optimism: [
    { token0: 'WETH', token1: 'USDC', token0Address: '0x4200000000000000000000000000000000000006', token1Address: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', decimals0: 18, decimals1: 6 },
    { token0: 'WETH', token1: 'DAI', token0Address: '0x4200000000000000000000000000000000000006', token1Address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals0: 18, decimals1: 18 },
    { token0: 'OP', token1: 'WETH', token0Address: '0x4200000000000000000000000000000000000042', token1Address: '0x4200000000000000000000000000000000000006', decimals0: 18, decimals1: 18 },
    { token0: 'WBTC', token1: 'WETH', token0Address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095', token1Address: '0x4200000000000000000000000000000000000006', decimals0: 8, decimals1: 18 },
    { token0: 'LINK', token1: 'WETH', token0Address: '0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6', token1Address: '0x4200000000000000000000000000000000000006', decimals0: 18, decimals1: 18 },
  ],
  
  base: [
    { token0: 'WETH', token1: 'USDC', token0Address: '0x4200000000000000000000000000000000000006', token1Address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals0: 18, decimals1: 6 },
    { token0: 'WETH', token1: 'DAI', token0Address: '0x4200000000000000000000000000000000000006', token1Address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals0: 18, decimals1: 18 },
    { token0: 'cbETH', token1: 'WETH', token0Address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', token1Address: '0x4200000000000000000000000000000000000006', decimals0: 18, decimals1: 18 },
    { token0: 'AERO', token1: 'WETH', token0Address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', token1Address: '0x4200000000000000000000000000000000000006', decimals0: 18, decimals1: 18 },
    { token0: 'BRETT', token1: 'WETH', token0Address: '0x532f27101965dd16442E59d40670FaF5eBB142E4', token1Address: '0x4200000000000000000000000000000000000006', decimals0: 18, decimals1: 18 },
    { token0: 'DEGEN', token1: 'WETH', token0Address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', token1Address: '0x4200000000000000000000000000000000000006', decimals0: 18, decimals1: 18 },
  ],
  
  bsc: [
    { token0: 'WBNB', token1: 'USDT', token0Address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', token1Address: '0x55d398326f99059fF775485246999027B3197955', decimals0: 18, decimals1: 18 },
    { token0: 'WBNB', token1: 'BUSD', token0Address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', token1Address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', decimals0: 18, decimals1: 18 },
    { token0: 'WETH', token1: 'USDT', token0Address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', token1Address: '0x55d398326f99059fF775485246999027B3197955', decimals0: 18, decimals1: 18 },
    { token0: 'BTCB', token1: 'WBNB', token0Address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', token1Address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals0: 18, decimals1: 18 },
    { token0: 'CAKE', token1: 'WBNB', token0Address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', token1Address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals0: 18, decimals1: 18 },
  ]
};

// Uniswap V3 Quoter ABI (simplified)
const QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
];

// Get Uniswap V3 price
async function getUniswapV3Price(network, pair, amountIn) {
  try {
    const provider = new ethers.JsonRpcProvider(network.rpc, network.chainId, {
      staticNetwork: true
    });
    
    // Set a timeout for the provider
    provider.pollingInterval = 5000;
    
    const quoter = new ethers.Contract(network.quoterV2, QUOTER_ABI, provider);
    
    // Try most common fee tier first (3000 = 0.3%)
    const feeTiers = [3000, 500, 10000];
    let bestQuote = null;
    let bestAmountOut = 0n;

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

        // Add timeout to the call
        const callPromise = quoter.quoteExactInputSingle.staticCall(params);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('RPC timeout')), 5000)
        );
        
        const result = await Promise.race([callPromise, timeoutPromise]);
        const amountOut = result[0];

        if (amountOut > bestAmountOut) {
          bestAmountOut = amountOut;
          bestQuote = {
            amountOut: ethers.formatUnits(amountOut, pair.decimals1),
            fee: fee
          };
        }
      } catch (err) {
        // Pool doesn't exist for this fee tier or RPC error
        continue;
      }
    }

    return bestQuote;
  } catch (error) {
    console.log(`    ⚠️  Uniswap error: ${error.message}`);
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
      timeout: 5000,
      headers: {
        'Accept': 'application/json'
      }
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

// Scan for arbitrage opportunities
async function scanArbitrage(networkKey) {
  const network = NETWORKS[networkKey];
  const opportunities = [];
  const tradeSize = 1; // Trade 1 unit of token0
  
  // Get network-specific pairs
  const allPairs = TRADING_PAIRS[networkKey] || TRADING_PAIRS.ethereum;
  
  // IMPORTANT: Only scan a subset of pairs per call (5-10 pairs max)
  // This prevents timeouts and ensures we actually get results
  const maxPairsPerScan = 8;
  const randomStart = Math.floor(Math.random() * allPairs.length);
  const pairsToScan = [];
  
  for (let i = 0; i < maxPairsPerScan && i < allPairs.length; i++) {
    const index = (randomStart + i) % allPairs.length;
    pairsToScan.push(allPairs[index]);
  }
  
  console.log(`\n🔍 Scanning ${pairsToScan.length} pairs on ${networkKey}...`);

  for (const pair of pairsToScan) {
    try {
      console.log(`  Checking ${pair.token0}/${pair.token1}...`);
      
      // Get prices from both DEXes in parallel with timeout
      const timeout = 8000; // 8 second timeout per pair
      const [uniswapQuote, paraswapQuote] = await Promise.race([
        Promise.all([
          getUniswapV3Price(network, pair, tradeSize),
          getParaswapPrice(network, pair, tradeSize)
        ]),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), timeout)
        )
      ]);

      if (!uniswapQuote || !paraswapQuote) {
        console.log(`    ⚠️  No quotes available`);
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

      // LOWER THRESHOLD to 0.3% to find more opportunities
      if (profitPercent > 0.3) {
        console.log(`    ✅ FOUND: ${profitPercent.toFixed(3)}% profit!`);
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
      } else {
        console.log(`    📊 ${profitPercent.toFixed(3)}% (too low)`);
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
  const testPair = pairs[0]; // Test first pair
  
  console.log(`\n🧪 TESTING ${network.toUpperCase()}: ${testPair.token0}/${testPair.token1}`);
  
  try {
    const tradeSize = 1;
    
    console.log(`📍 Testing Uniswap V3...`);
    const uniswapStart = Date.now();
    const uniswapQuote = await getUniswapV3Price(networkConfig, testPair, tradeSize);
    const uniswapTime = Date.now() - uniswapStart;
    
    console.log(`📍 Testing Paraswap V5...`);
    const paraswapStart = Date.now();
    const paraswapQuote = await getParaswapPrice(networkConfig, testPair, tradeSize);
    const paraswapTime = Date.now() - paraswapStart;
    
    const result = {
      success: true,
      network,
      pair: `${testPair.token0}/${testPair.token1}`,
      uniswap: {
        success: !!uniswapQuote,
        price: uniswapQuote?.amountOut || null,
        fee: uniswapQuote?.fee || null,
        time: `${uniswapTime}ms`
      },
      paraswap: {
        success: !!paraswapQuote,
        price: paraswapQuote?.amountOut || null,
        dex: paraswapQuote?.dex || null,
        time: `${paraswapTime}ms`
      },
      arbitrage: null
    };
    
    if (uniswapQuote && paraswapQuote) {
      const uniPrice = parseFloat(uniswapQuote.amountOut);
      const paraPrice = parseFloat(paraswapQuote.amountOut);
      const diff = Math.abs(uniPrice - paraPrice);
      const profitPercent = (diff / Math.min(uniPrice, paraPrice)) * 100;
      
      result.arbitrage = {
        priceSpread: diff.toFixed(6),
        profitPercent: profitPercent.toFixed(3) + '%',
        profitable: profitPercent > 0.3
      };
    }
    
    console.log(`✅ Test complete`);
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
  console.log(`   BSC: ${TRADING_PAIRS.bsc.length} pairs ⚡ LOW GAS`);
  console.log(`\n✅ Focus on L2 networks for best profit margins!`);
});

module.exports = app;
        
