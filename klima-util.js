const {ethers} = require("ethers")
const helpers = require("./helpers")

const sKlimaABI = require("./abi/sohm.json")
const circulatingSupplyABI = require("./abi/circulating-supply-contract.json")
const stakingABI = require("./abi/staking-contract.json")
const {provider, getQuoteFromLP, usdcEth, formatUSD} = require("./util")

// Addresses: https://klimadao.notion.site/Official-addresses-7c8efb747bcc4a13a6220084243b7b8a
const circulatingSupplyAddress = "0x0EFFf9199Aa1Ac3C3E34E957567C1BE8bF295034"
const sKlimaAddress = "0xb0C22d8D350C67420f06F48936654f567C73E8C8"
const stakingAddress = "0x25d28a24ceb6f81015bb0b2007d795acac411b4d"
// const ohmDai = "0x34d7d7Aaf50AD4944B70B320aCB24C95fa2def7c"
const bctKlima = "0x9803c7ae526049210a1725f7487af26fe2c24614"
const usdcBct = "0x1e67124681b402064cd0abe8ed1b5c79d2e02f64"

async function _getStakedBalance(address) {
  const sklima = new ethers.Contract(sKlimaAddress, sKlimaABI, provider)
  const balance = await sklima.balanceOf(address)/ (Math.pow(10, 9))
  return balance
}


/* 
  function OHMCirculatingSupply() external view returns ( uint ) {
      uint _totalSupply = IERC20( OHM ).totalSupply();

      uint _circulatingSupply = _totalSupply.sub( getNonCirculatingOHM() );

      return _circulatingSupply;
  }

  function getNonCirculatingOHM() public view returns ( uint ) {
      uint _nonCirculatingOHM;

      for( uint i=0; i < nonCirculatingOHMAddresses.length; i = i.add( 1 ) ) {
          _nonCirculatingOHM = _nonCirculatingOHM.add( IERC20( OHM ).balanceOf( nonCirculatingOHMAddresses[i] ) );
      }

      return _nonCirculatingOHM;
  }
*/

// async function marketCap() {
//   const circulatingSupplyContract = new ethers.Contract(circulatingSupplyAddress, circulatingSupplyABI, provider);
//   const circulatingSupply = await circulatingSupplyContract.OHMCirculatingSupply()
//   const {OHM_DAI} = await getOhmPrice()

//   return formatUSD(circulatingSupply * OHM_DAI / Math.pow(10, 9))
// }

async function getStakingStats(address) {
  const stakingContract = new ethers.Contract(stakingAddress, stakingABI, provider);
  const sKlimaContract = new ethers.Contract(sKlimaAddress, sKlimaABI, provider);
  // Calculating staking
  const epoch = await stakingContract.epoch();
  const stakingReward = epoch.distribute;

  const excess = await sKlimaContract.balanceOf(stakingAddress)
  const totalSupply = await sKlimaContract.totalSupply()
  const circ = totalSupply - excess

  const stakingRebase = stakingReward / circ;
  const fiveDayRate = Math.pow(1 + stakingRebase, 5 * 3) - 1;
  const stakingAPY = Math.pow(1 + stakingRebase, 365 * 3) - 1;

  const daystoDouble = Math.log(2) / Math.log(1+stakingRebase) / 3

  let res = {stakingRebase, fiveDayRate, stakingAPY: stakingAPY*100, daystoDouble}

  if (address) {
    const ohmBalance = await _getStakedBalance(address)
    res["nextReward"] = ohmBalance * stakingRebase
  }

  return res
}

async function getKlimaPrice() {
  const bctQuote = await getQuoteFromLP(bctKlima)
  const bctUsdQuote = 1/(await getQuoteFromLP(usdcBct))*Math.pow(10, 12)
  const klimaUsdQuote = (bctUsdQuote / bctQuote) / Math.pow(10, 9)
  const ethQuote = 1/(await getQuoteFromLP(usdcEth))*Math.pow(10, 12)

  return {
    USDC_BCT: bctUsdQuote,
    USDC_KLIMA: klimaUsdQuote,
    KLIMA_ETH: klimaUsdQuote / ethQuote,
    USD_ETH: ethQuote
  }
}

async function getKlimaBalanceAfterDays(address, days, apy) {
  console.log("a")
  let rebaseRate
  if (apy) {
    rebaseRate = Math.log(apy/100)/(3*365)
  } else {
    const stakingStats = await getStakingStats()
    rebaseRate = stakingStats.stakingRebase
    apy = Math.exp(rebaseRate * 3 * 365)
  }
  if (!days) {
    days = 30
  }

  const klimaBalance = await _getStakedBalance(address)

  return {days, apy, klimaBalance: klimaBalance * Math.pow(1+rebaseRate, days*3)}
}

async function getEthValueAfterDays(address, days, apy) {
  const {KLIMA_ETH} = await getKlimaPrice()
  const balanceAfterDays = await getKlimaBalanceAfterDays(address, days, apy)
  const ethValue = KLIMA_ETH * balanceAfterDays.klimaBalance
  
  return {ethValue, ...balanceAfterDays}
}

async function daysToGetEthValue(address, ethValue) {
  const klimaBalance = await _getStakedBalance(address)
  const {KLIMA_ETH} = await getKlimaPrice()
  const {stakingRebase} = await getStakingStats()
  const requiredKlimaBalance = ethValue / KLIMA_ETH
  
  const days = Math.log(requiredKlimaBalance/klimaBalance) / Math.log(1+stakingRebase) / 3
  let targetDate = new Date()
  targetDate.setDate(targetDate.getDate() + Math.round(days))

  return {ethValue, days, targetDate, klimaBalance: klimaBalance, requiredOhmBalance: requiredKlimaBalance, stakingRebase, KLIMA_ETH}
}

async function daysToGetUsdValue(address, usdValue) {
  const klimaBalance = await _getStakedBalance(address)
  const {USDC_KLIMA} = await getKlimaPrice()
  const {stakingRebase} = await getStakingStats()
  const requiredKlimaBalance = usdValue / USDC_KLIMA
  
  const days = Math.log(requiredKlimaBalance/klimaBalance) / Math.log(1+stakingRebase) / 3
  let targetDate = new Date()
  targetDate.setDate(targetDate.getDate() + Math.round(days))

  return {usdValue, days, targetDate, klimaBalance: klimaBalance, requiredOhmBalance: requiredKlimaBalance, stakingRebase, USDC_KLIMA}
}

async function daysToGetKlimaBalance(address, requiredOhmBalance) {
  const klimaBalance = await _getStakedBalance(address)
  const {stakingRebase} = await getStakingStats()
  
  const days = Math.log(requiredOhmBalance/klimaBalance) / Math.log(1+stakingRebase) / 3
  let targetDate = new Date()
  targetDate.setDate(targetDate.getDate() + Math.round(days))

  return {requiredOhmBalance, days, targetDate, klimaBalance, stakingRebase}
}

async function daysToGetReward(address, requiredRebaseReward) {
  const klimaBalance = await _getStakedBalance(address)
  const {stakingRebase} = await getStakingStats()
  const requiredKlimaBalance = requiredRebaseReward / stakingRebase
  
  const days = Math.log(requiredKlimaBalance/klimaBalance) / Math.log(1+stakingRebase) / 3
  let targetDate = new Date()
  targetDate.setDate(targetDate.getDate() + Math.round(days))

  return {requiredRebaseReward, requiredKlimaBalance, days, targetDate, klimaBalance, stakingRebase}
}

async function getStakedBalance(address) {
  if (address.indexOf(".") !== -1) {
    address = await provider.resolveName(address)
  }
  const balance = await _getStakedBalance(address, sKlimaAddress)
  return balance
}

async function timeUntilRebase() {
  const currentBlock = await provider.getBlockNumber()
  const stakingContract = new ethers.Contract(stakingAddress, stakingABI, provider);
  const epoch = await stakingContract.epoch();
  const rebaseBlock = epoch.endBlock
  const seconds = helpers.secondsUntilBlock(currentBlock, rebaseBlock)
  return helpers.prettifySeconds(seconds)
}

async function getStakedKlimaEthValue(address) {
  const { USDC_KLIMA, USD_ETH } = await getKlimaPrice()
  const balance = (await _getStakedBalance(address, sKlimaAddress))

  const balanceUSD = balance * USDC_KLIMA
  const balanceETH = balanceUSD / USD_ETH

  return balanceETH
}



async function main() {
  
  await getStakingStats()
  
}

module.exports = {
  getStakedKlimaEthValue, 
  getStakingStats, 
  getKlimaPrice, 
  getStakedBalance, 
  timeUntilRebase, 
  getKlimaBalanceAfterDays, 
  getEthValueAfterDays, 
  daysToGetEthValue,
  daysToGetUsdValue, 
  daysToGetKlimaBalance,
  daysToGetReward,
  // marketCap
}

// main()
//   .then(() => process.exit(0))
//   .catch((error) => {
//     console.error(error)
//     process.exit(1)
//   })