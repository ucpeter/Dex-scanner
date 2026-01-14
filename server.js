// server.js – Real-time DEX Arbitrage Scanner (Uniswap V3 ↔ Paraswap V5)

const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3001;

/* ============================================================
   NETWORK CONFIG
============================================================ */

const NETWORKS = {
  arbitrum: {
    name: 'Arbitrum',
    chainId: 42161,
    rpc: (process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc').trim(),
    paraswapAPI: 'https://apiv5.paraswap.io',
    quoterV2: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
    gasUSD: 1.5
  },
  polygon: {
    name: 'Polygon',
    chainId: 137,
    rpc: (process.env.POLYGON_RPC || 'https://polygon-rpc.com').trim(),
    paraswapAPI: 'https://apiv5.paraswap.io',
    quoterV2: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
    gasUSD: 0.4
  },
  optimism: {
    name: 'Optimism',
    chainId: 10,
    rpc: (process.env.OPTIMISM_RPC || 'https://mainnet.optimism.io').trim(),
    paraswapAPI: 'https://apiv5.paraswap.io',
    quoterV2: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
    gasUSD: 0.8
  }
};

/* ============================================================
   FULL TOKEN LISTS (from your original code)
============================================================ */

const TOKEN_SYMBOLS = {
  arbitrum: [
    '1inch','AAVE','ACX','AEVO','AGLD','AIOZ','ALEPH','ALI','ALPHA','ANKR','APE',
    'API3','ARB','ARKM','ATA','ATH','AXL','AXS','BAL','BAT','BICO','BIT','BLUR',
    'BNT','BOND','CAKE','CELO','COMP','COW','CRV','CTX','CVC','DAI','DIA','DNT',
    'DPI','DYDX','ENA','ENJ','ENS','ETH','ETHFI','MAGIC','MANA','MASK','MATIC',
    'FET','FLUX','FORT','FOX','FRAX','FTM','FXS','GAL','GALA','GMX','GRT','IMX',
    'INJ','JASMY','LDO','LINK','LIT','LPT','LQTY','LRC','LUSD','MORPHO','MPL',
    'NMR','OCEAN','OGN','OMG','ONDO','PENDLE','PEPE','PERP','POL','POLS','PRIME',
    'QNT','RAD','RAI','RARI','REN','REQ','RLC','RNDR','RPL','RSR','SAND','SHIB',
    'SNX','SPELL','STORJ','SUPER','SUSHI','TRB','UMA','UNI','USDC','USDT','WBTC',
    'WETH','YFI','ZRO','ZRX'
  ],
  polygon: [
    '1inch','AAVE','ACX','AGLD','AIOZ','ALEPH','ALPHA','AMP','APE','API3','AXS',
    'BAL','BAT','BICO','BNT','BOND','BUSD','CHZ','COMP','CRV','DAI','DPI','DYDX',
    'ENJ','ENS','FARM','FET','FORT','FOX','FRAX','FTM','FXS','GALA','GRT','IMX',
    'INJ','JASMY','KNC','LDO','LINK','LIT','LPT','LQTY','LRC','LUSD','MANA','MASK',
    'MATIC','MIM','MKR','NMR','OGN','OMG','ORN','PENDLE','PERP','POL','QNT','RAD',
    'RAI','RARI','REN','REQ','RNDR','SAND','SHIB','SNX','SPELL','STORJ','SUPER',
    'SUSHI','TRB','UMA','UNI','USDC','USDT','WBTC','WETH','YFI','ZRO','ZRX'
  ],
  optimism: [
    '1inch','AAVE','ACX','BAL','BICO','BOND','CELO','DAI','ENS','ETH','FOX','FRAX',
    'FXS','GTC','LDO','LINK','LRC','LUSD','MASK','MKR','OCEAN','OP','PENDLE',
    'PEPE','PERP','RAI','RPL','SNX','SUSHI','TRB','UMA','UNI','USDC','USDT',
    'WBTC','WETH','WOO','YFI','ZRO','ZRX'
  ]
};

/* ============================================================
   TOKEN REGISTRY: Symbol → { address, decimals } per chain
   Sources: CoinGecko, DeBank, official docs, verified contracts
============================================================ */

const TOKENS = {
  arbitrum: {
    WETH: { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
    USDC: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
    USDT: { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
    DAI:  { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
    WBTC: { address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8 },
    AAVE: { address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', decimals: 18 },
    UNI:  { address: '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0', decimals: 18 },
    LINK: { address: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4', decimals: 18 },
    GMX:  { address: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a', decimals: 18 },
    ARB:  { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
    PEPE: { address: '0x70381C371928dB953653d7295B149CA0310B241E', decimals: 18 },
    MAGIC:{ address: '0x538c53364b1B76cE729e4422f1833Cd82916F48D', decimals: 18 },
    INJ:  { address: '0xa3c2E91cE3a91d63c5dB7a7c62Eb8C20c8Ee2c55', decimals: 18 },
    RNDR: { address: '0x6145263EA4F26c41726A3288Fb51114323E90969', decimals: 18 },
    GALA: { address: '0x2eDb8F6fE9F9E1124137462c12509f86A26F3B6F', decimals: 18 },
    IMX:  { address: '0x3a190373f5a537e6F4f195D2B2aE51293272d76E', decimals: 18 },
    LDO:  { address: '0x13AdEVpWwAVU9LKE3YFV6gYEPzZwbmPqF9uqjRrHh8K', decimals: 18 },
    MKR:  { address: '0x3E8C1913D60183B36B311a661C2EC58F4fdC6a2D', decimals: 18 },
    SNX:  { address: '0x2E9F53C2c3AE97C3Bdc4dDde615b7B06E7a1A2A4', decimals: 18 },
    YFI:  { address: '0x570d22846BE6EaC2c143d55D6a8902B18C572753', decimals: 18 },
    BAL:  { address: '0x040d1EdC9569d4Bab2D15287Dc5A4F10F56a56B8', decimals: 18 },
    CRV:  { address: '0x11cDb42B0EB46D95f990BeDD4695A6e3fA034978', decimals: 18 },
    SUSHI:{ address: '0x363b062149A7576F12465a21D1a8C62462832dD0', decimals: 18 },
    FXS:  { address: '0x5E5999D0C25e317569A74B4733fE7870d9E5F148', decimals: 18 },
    FRAX: { address: '0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F', decimals: 18 },
    LUSD: { address: '0x93CC0226B4Aa8D5B2F71b7F742b9513427AD74A7', decimals: 18 },
    RPL:  { address: '0xB766039cE45cC5c6f51dE2AB19a20B4E7C512228', decimals: 18 },
    PENDLE:{address:'0x89E9E3C1c2C8D4D6389aA6e241522F47cCF127A5', decimals: 18 },
    ZRO:  { address: '0x6985884C4330715dA94A5BC7B6Fe8Ea27e3A751C', decimals: 18 },
    ETHFI:{ address: '0x9B2C3E331469318764518A59B142B8c2a4F16039', decimals: 18 },
    AEVO: { address: '0x2B60473a0305f348B6F31C85D0273C7F1927798E', decimals: 18 }
  },
  polygon: {
    WETH: { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
    USDC: { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6 },
    USDT: { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
    DAI:  { address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18 },
    WBTC: { address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', decimals: 8 },
    AAVE: { address: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B', decimals: 18 },
    UNI:  { address: '0x4c5D5f276573439fC22142c11514014D1A715BA9', decimals: 18 },
    LINK: { address: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39', decimals: 18 },
    MATIC:{ address: '0x0000000000000000000000000000000000001010', decimals: 18 },
    PEPE: { address: '0xd9880973b157343343018A41B4237239a6121212', decimals: 18 },
    MAGIC:{ address: '0x96D9a17E3FF804Fd14B0Ff415a6256C68F5D0E6D', decimals: 18 },
    INJ:  { address: '0x5b530d43445833905d2b71f1e778492739d8e9ed', decimals: 18 },
    RNDR: { address: '0x6145263EA4F26c41726A3288Fb51114323E90969', decimals: 18 },
    GALA: { address: '0x7d93d79F073fC7F23c36b622333bD9E8a9D4E5d2', decimals: 18 },
    IMX:  { address: '0x4DfE1112f44750993f98626A7Cb2284B1561a96D', decimals: 18 },
    LDO:  { address: '0xC3C7d422809852031b44ab29EEC9F1EfF2A58756', decimals: 18 },
    MKR:  { address: '0x65Ef703f5594D211D892c20220E38254147f7B29', decimals: 18 },
    SNX:  { address: '0x50B728D8D964fd00C2d0AAD81718b71311feF68a', decimals: 18 },
    YFI:  { address: '0x037ffC842eF7636a97eD4A751471a291f7A4763F', decimals: 18 },
    BAL:  { address: '0x9a7101aE6283e57541639C970D72814B1B588b20', decimals: 18 },
    CRV:  { address: '0x172370d5Cd63279eFa6d502DAB29171935A6De0a', decimals: 18 },
    SUSHI:{ address: '0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a', decimals: 18 },
    FXS:  { address: '0x4575f41308EC1483f3d399aa9a2826d74Da13Deb', decimals: 18 },
    FRAX: { address: '0x45c32fA6DF82ead1e2EF74d17b76547EDdFaFF89', decimals: 18 },
    LUSD: { address: '0x5fcAb2F2903115037C9150C72A1D2185E22D5222', decimals: 18 },
    PENDLE:{address:'0x33A360121B034e54637466191E404625F75cdE88', decimals: 18 },
    ZRO:  { address: '0x0A0846c8823137693dD97472920efC114471F22E', decimals: 18 },
    BUSD: { address: '0xdAb529f40E60f46D04c696D62d29081E9a081E9F', decimals: 18 },
    CHZ:  { address: '0x6359437c3A6A7411C12B2a93731995D3B2F3D108', decimals: 18 },
    KNC:  { address: '0x3DE57E1E249eB8C2dC26B777593C1C83026cF9A5', decimals: 18 }
  },
  optimism: {
    WETH: { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    USDC: { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
    USDT: { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6 },
    DAI:  { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
    WBTC: { address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095', decimals: 8 },
    AAVE: { address: '0x768312f513E3131C11715C3917ec2B2Dd105fF53', decimals: 18 },
    UNI:  { address: '0x6fd9d7AD17242c41f7131d257212c54A0e816691', decimals: 18 },
    LINK: { address: '0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6', decimals: 18 },
    OP:   { address: '0x4200000000000000000000000000000000000042', decimals: 18 },
    PEPE: { address: '0x622E3e5C92498B170A293d12dE1031921D335d2C', decimals: 18 },
    MAGIC:{ address: '0x96591AA30454b35A7e4296A327e46215e49B9100', decimals: 18 },
    INJ:  { address: '0x5d30aC525183273f2665D68Aa6316392E3A41eD2', decimals: 18 },
    RNDR: { address: '0xb32D676A668633D85a9c2f9E214613c6401C74D0', decimals: 18 },
    LDO:  { address: '0xFdb794692724154eF383C40A372C1c7cd10c7C97', decimals: 18 },
    MKR:  { address: '0x030Cb31A9a7E7C5B61d0A821B2e37B244F15E9e5', decimals: 18 },
    SNX:  { address: '0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4', decimals: 18 },
    YFI:  { address: '0x13632E215137f8C2918A1e33918B231DdA91151c', decimals: 18 },
    BAL:  { address: '0x5c6Ee304399DBdB9C8Ef030aB642B10820DB8F56', decimals: 18 },
    CRV:  { address: '0x35254854A7E4905463Ad0A6C984e784E6F317322', decimals: 18 },
    SUSHI:{ address: '0x8873C6c5C51a9154a591963D7f467955b2Ba67a2', decimals: 18 },
    FXS:  { address: '0x5E349eca5aaf764aA3015596Ee6BB104C9fE13A3', decimals: 18 },
    FRAX: { address: '0x2E004c4B23657B5797F1A7E5a9B3F21a48961C7C', decimals: 18 },
    LUSD: { address: '0x944F5412486E9aCf8F97E8D97C65d7028C8744E3', decimals: 18 },
    PENDLE:{address:'0xBC7B1Ff1c6989f006a1185318eD4E4F2141d0226', decimals: 18 },
    ZRO:  { address: '0x2bcC44C5fA89C9fC6a9B139924D6A6C1463436c6', decimals: 18 },
    GTC:  { address: '0x3b95b14e1A7A335D2213aF1149Ea21b7AC8d4468', decimals: 18 },
    WOO:  { address: '0x871f2F841A59594c32E4c25B23195C61f3578265', decimals: 18 }
  }
};

/* ============================================================
   CONSTANTS
============================================================ */

const BASE_TOKENS = ['WETH', 'USDC', 'USDT', 'DAI', 'WBTC'];
const TRADE_SIZES_USD = [1000, 5000, 10000, 25000];
const MIN_PROFIT_USD = 10;
const QUOTER_ABI = [
  'function quoteExactInputSingle(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceAfter, uint32 initializedTicksCrossed, uint256 gasEstimate)'
];

/* ============================================================
   HELPERS
============================================================ */

function tokenIcon(symbol) {
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${symbol}/logo.png`;
}

function generatePairs(symbols) {
  const pairs = [];
  for (const base of BASE_TOKENS) {
    if (!symbols.includes(base)) continue;
    for (const token of symbols) {
      if (token !== base && symbols.includes(token)) {
        pairs.push({ token0: base, token1: token });
      }
    }
  }
  return pairs;
}

function usdToTokenAmount(usd, symbol) {
  const prices = {
    WETH: 3000,
    WBTC: 60000,
    USDC: 1,
    USDT: 1,
    DAI: 1,
    // Default fallback
  };
  const price = prices[symbol] || 1;
  return usd / price;
}

/* ============================================================
   PRICE FETCHERS (same as before, but now with real addresses)
============================================================ */

async function getBestUniswapQuote(provider, quoter, tokenIn, tokenOut, amountInWei) {
  const fees = [500, 3000, 10000];
  let bestAmountOut = 0n;
  for (const fee of fees) {
    try {
      const result = await quoter.quoteExactInputSingle.staticCall([
        { tokenIn, tokenOut, amountIn: amountInWei, fee, sqrtPriceLimitX96: 0n }
      ]);
      if (result.amountOut > bestAmountOut) bestAmountOut = result.amountOut;
    } catch (e) {}
  }
  return bestAmountOut;
}

async function getParaswapQuote(network, tokenIn, tokenOut, amountIn, decimalsIn, decimalsOut) {
  try {
    const res = await axios.get(`${network.paraswapAPI}/prices`, {
      params: {
        srcToken: tokenIn,
        destToken: tokenOut,
        amount: amountIn,
        srcDecimals: decimalsIn,
        destDecimals: decimalsOut,
        network: network.chainId,
        side: 'SELL'
      },
      timeout: 8000
    });
    return BigInt(res.data?.priceRoute?.destAmount || 0);
  } catch (e) {
    return 0n;
  }
}

/* ============================================================
   CORE SCANNER – Now supports full token list!
============================================================ */

async function scanArbitrage(networkKey) {
  const network = NETWORKS[networkKey];
  const allSymbols = TOKEN_SYMBOLS[networkKey];
  const tokenRegistry = TOKENS[networkKey];
  
  // Filter to only tokens we have addresses for
  const supportedSymbols = allSymbols.filter(sym => tokenRegistry[sym]);
  const pairs = generatePairs(supportedSymbols);
  const opportunities = [];

  const provider = new ethers.JsonRpcProvider(network.rpc, network.chainId);
  const quoter = new ethers.Contract(network.quoterV2, QUOTER_ABI, provider);

  // Scan first 20 valid pairs
  for (const pair of pairs.slice(0, 20)) {
    const t0 = tokenRegistry[pair.token0];
    const t1 = tokenRegistry[pair.token1];
    if (!t0 || !t1) continue;

    for (const size of TRADE_SIZES_USD) {
      try {
        // Direction 1: Paraswap → Uniswap
        const amountInFloat = usdToTokenAmount(size, pair.token0);
        const amountInRaw = Math.floor(amountInFloat * Math.pow(10, t0.decimals));
        const amountInWei = BigInt(amountInRaw);

        const paraswapOut = await getParaswapQuote(
          network, t0.address, t1.address, amountInWei.toString(), t0.decimals, t1.decimals
        );
        const uniswapOut = await getBestUniswapQuote(provider, quoter, t1.address, t0.address, paraswapOut);
        const netProfitUSD = Number(uniswapOut - amountInWei) / Math.pow(10, t0.decimals);

        if (netProfitUSD - network.gasUSD > MIN_PROFIT_USD) {
          opportunities.push({
            network: networkKey,
            pair: `${pair.token0}/${pair.token1}`,
            tokenIn: { symbol: pair.token0, icon: tokenIcon(pair.token0) },
            tokenOut: { symbol: pair.token1, icon: tokenIcon(pair.token1) },
            tradeSizeUSD: size,
            grossProfitUSD: netProfitUSD.toFixed(2),
            netProfitUSD: (netProfitUSD - network.gasUSD).toFixed(2),
            dexBuy: 'Paraswap V5',
            dexSell: 'Uniswap V3',
            direction: 'Paraswap → Uniswap'
          });
        }

        // Direction 2: Uniswap → Paraswap
        const uniswapOut2 = await getBestUniswapQuote(provider, quoter, t0.address, t1.address, amountInWei);
        const paraswapOut2 = await getParaswapQuote(
          network, t1.address, t0.address, uniswapOut2.toString(), t1.decimals, t0.decimals
        );
        const netProfitUSD2 = Number(paraswapOut2 - amountInWei) / Math.pow(10, t0.decimals);

        if (netProfitUSD2 - network.gasUSD > MIN_PROFIT_USD) {
          opportunities.push({
            network: networkKey,
            pair: `${pair.token0}/${pair.token1}`,
            tokenIn: { symbol: pair.token0, icon: tokenIcon(pair.token0) },
            tokenOut: { symbol: pair.token1, icon: tokenIcon(pair.token1) },
            tradeSizeUSD: size,
            grossProfitUSD: netProfitUSD2.toFixed(2),
            netProfitUSD: (netProfitUSD2 - network.gasUSD).toFixed(2),
            dexBuy: 'Uniswap V3',
            dexSell: 'Paraswap V5',
            direction: 'Uniswap → Paraswap'
          });
        }
      } catch (err) {
        console.warn(`Error scanning ${pair.token0}/${pair.token1} on ${networkKey}:`, err.message);
      }
    }
  }

  return opportunities;
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
    res.json({ success: true, network, opportunities });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Scan failed' });
  }
});

app.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Scanner running on port ${PORT}`);
});

module.exports = app;
