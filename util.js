const {ethers} = require("ethers")
const LPABI = require("./abi/dai-ohm-lp.json")

const usdcEth = "0x34965ba0ac2451a34a0471f04cca3f990b8dea27"
const provider = new ethers.providers.JsonRpcProvider(process.env.JSON_RPC_PROVIDER_URL)

async function formatUSD(value) {
  return `$${(Math.round(value*100)/100).toLocaleString("en-US")}`
}

async function getReserves(contractAddress) {
  const lp = new ethers.Contract(contractAddress, LPABI, provider)
  const [reserve0, reserve1] = await lp.getReserves()
  return [reserve0, reserve1]
}

function getQuote(amount, reserve0, reserve1) {
  return amount * reserve1 / reserve0
}

async function getQuoteFromLP(lpAddress) {
  const [reserve0, reserve1] = await getReserves(lpAddress)
  return getQuote(1, reserve0, reserve1)
}

module.exports = {
  provider, 
  usdcEth, 
  getQuoteFromLP,
  formatUSD
}