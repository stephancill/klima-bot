const {provider, getQuoteFromLP, usdcEth } = require("./util")

function ethFormatter(value, usd) {
  return usd ? 
  `${Math.round(value*Math.pow(10,6))/Math.pow(10,6)} ETH ($${Math.round(value/usd*100)/100})` :
  `${Math.round(value*Math.pow(10,6))/Math.pow(10,6)} ETH` 
}

async function _gasToEth(gas, price) {
  if (!price) {
    price = await provider.getGasPrice()
  }
  return gas * price / Math.pow(10,18)
}

async function gasToEth(gas, price) {
  const usdEth = await getQuoteFromLP(usdcEth)
  const ethValue = await _gasToEth(gas, price)
  return ethFormatter(ethValue, usdEth)
}

async function gasPrice() {
  const usdEth = await getQuoteFromLP(usdcEth)
  const price = await provider.getGasPrice()

  const transferCost = await _gasToEth(26000, price)
  const swapCost = await _gasToEth(136731, price)
  const approve = await _gasToEth(26291, price)
  const arbitrumBridge = await _gasToEth(92000, price)
  const optimismBridge = await _gasToEth(214000, price)
  const polygonBridge = await _gasToEth(77257, price)
  const registerENS = await _gasToEth(46267+270896, price)
  const ensReverseRecord = await _gasToEth(127574, price) 

  return {
    gas: `${price.div(Math.pow(10, 9)).toString()} gwei`,
    transfer: ethFormatter(transferCost, usdEth),
    swap: ethFormatter(swapCost, usdEth),
    approve: ethFormatter(approve, usdEth),
    arbitrumBridge: ethFormatter(arbitrumBridge, usdEth),
    optimismBridge: ethFormatter(optimismBridge, usdEth),
    polygonBridge: ethFormatter(polygonBridge, usdEth),
    registerENS: ethFormatter(registerENS, usdEth),
    ensReverseRecord: ethFormatter(ensReverseRecord, usdEth)
  } 
}

module.exports = {
  gasPrice,
  gasToEth
}