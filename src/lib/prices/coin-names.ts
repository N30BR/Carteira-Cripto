// A Binance só informa o símbolo; estes nomes deixam a tela mais amigável.
// Moedas fora da lista aparecem só pelo símbolo.
export const COIN_NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  USDT: "Tether",
  USDC: "USD Coin",
  BNB: "BNB",
  SOL: "Solana",
  XRP: "XRP",
  DOGE: "Dogecoin",
  ADA: "Cardano",
  TRX: "TRON",
  AVAX: "Avalanche",
  LINK: "Chainlink",
  DOT: "Polkadot",
  XLM: "Stellar",
  TAO: "Bittensor",
  NEAR: "NEAR Protocol",
  LTC: "Litecoin",
  BCH: "Bitcoin Cash",
  SUI: "Sui",
  TON: "Toncoin",
  HBAR: "Hedera",
  UNI: "Uniswap",
  AAVE: "Aave",
  ATOM: "Cosmos",
  APT: "Aptos",
  ARB: "Arbitrum",
  OP: "Optimism",
  FIL: "Filecoin",
  ICP: "Internet Computer",
  PEPE: "Pepe",
  SHIB: "Shiba Inu",
  RENDER: "Render",
  FET: "Artificial Superintelligence Alliance",
  INJ: "Injective",
  SEI: "Sei",
  TIA: "Celestia",
};

export function coinName(id: string): string {
  return COIN_NAMES[id] ?? id;
}
