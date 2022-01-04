const {ethers} = require("ethers")
const helpers = require("./helpers")

const sKlimaABI = require("./abi/sohm.json")
const stakingABI = require("./abi/staking-contract.json")
const LPABI = require("./abi/dai-ohm-lp.json")
const {provider, getQuoteFromLP, usdcEth, formatUSD} = require("./util")

// Addresses: https://klimadao.notion.site/Official-addresses-7c8efb747bcc4a13a6220084243b7b8a
const circulatingSupplyAddress = "0x0EFFf9199Aa1Ac3C3E34E957567C1BE8bF295034"
const sKlimaAddress = "0xb0C22d8D350C67420f06F48936654f567C73E8C8"
const stakingAddress = "0x25d28a24ceb6f81015bb0b2007d795acac411b4d"
const bctAddress = "0x2f800db0fdb5223b3c3f354886d907a671414a7f"
const bctKlima = "0x9803c7ae526049210a1725f7487af26fe2c24614" // token0 = BCT
const usdcBct = "0x1e67124681b402064cd0abe8ed1b5c79d2e02f64" // token1 = BCT
const treasuryAddress = "0x7Dd4f0B986F032A44F913BF92c9e8b7c17D77aD7"

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

async function _getBacking() {
  const bctContract = new ethers.Contract(bctAddress, sKlimaABI, provider)
  const bctKlimaLP = new ethers.Contract(bctKlima, LPABI, provider)
  const bctUsdcLP = new ethers.Contract(usdcBct, LPABI, provider)

  const [
    directBCT,
    bctKlimaLPBalance, 
    bctKlimaLPTotalSupply, 
    bctKlimaReserves, 
    bctUsdcLPBalance, 
    bctUsdcLPTotalSupply, 
    bctUsdcReserves
  ] = await Promise.all([
    bctContract.balanceOf(treasuryAddress),
    bctKlimaLP.balanceOf(treasuryAddress),
    bctKlimaLP.totalSupply(),
    bctKlimaLP.getReserves(),
    bctUsdcLP.balanceOf(treasuryAddress),
    bctUsdcLP.totalSupply(),
    bctUsdcLP.getReserves()
  ])

  const bctKlimaBCTReserves = bctKlimaReserves[0]
  const bctUsdcBCTReserves = bctUsdcReserves[1]

  let bctKlimaLPOwnershipFactor = bctKlimaLPBalance.div(`${10**15}`).div(bctKlimaLPTotalSupply.div(`${10**18}`))  
  let bctUsdcLPOwnershipFactor = bctUsdcLPBalance.div(`${10**15}`).div(bctUsdcLPTotalSupply.div(`${10**18}`))  

  const treasuryBCT = 
    (directBCT
    .add(bctKlimaBCTReserves.mul(bctKlimaLPOwnershipFactor).div(1000))
    .add(bctUsdcBCTReserves.mul(bctUsdcLPOwnershipFactor).div(1000))).div(`${10**18}`)
    
  const {USDC_BCT, USDC_KLIMA} = await getKlimaPrice()

  const sKlimaContract = new ethers.Contract(sKlimaAddress, sKlimaABI, provider);
  const excess = await sKlimaContract.balanceOf(stakingAddress)
  const totalSupply = await sKlimaContract.totalSupply()
  const circ = (totalSupply - excess) / (10e8)

  // console.log(treasuryBCT.toNumber() * (USDC_BCT), (bctUsdcBCTReserves.div(10e18).toNumber()), (bctKlimaBCTReserves[1].div(10e9).toNumber() * USDC_KLIMA))

  const treasuryAssetsValue = treasuryBCT.toNumber() * (USDC_BCT) + (bctUsdcReserves[0].div(`${10e5}`).toNumber()) + (bctKlimaReserves[1].div(`${10e8}`).toNumber()) * USDC_KLIMA
  const treasuryBCTMarketValue = Math.round(treasuryBCT.toNumber() * USDC_BCT, 2)
  const bctPerCirculatingKlima = Math.round(treasuryBCT.toNumber() / circ * 100) / 100
  const bctPerCirculatingKlimaMV = Math.round(bctPerCirculatingKlima * USDC_BCT * 100) / 100
  const marketValueBackingPerCircKlima = Math.round(treasuryAssetsValue / circ * 100) / 100

  return {
    USDC_BCT,
    treasuryBCT,
    treasuryBCTMarketValue,
    circulatingKlima: circ,
    bctPerCirculatingKlima,
    bctPerCirculatingKlimaMV,
    marketValueBackingPerCircKlima
  }

}

async function getBacking() {
  const {USDC_BCT, treasuryBCT, treasuryBCTMarketValue, circulatingKlima, bctPerCirculatingKlima, bctPerCirculatingKlimaMV, marketValueBackingPerCircKlima} = await _getBacking()
  return {
    USDC_BCT: `$${Math.round(USDC_BCT*100)/100}`,
    treasuryBCT: ethers.utils.commify(treasuryBCT),
    treasuryBCTMarketValue: `$${ethers.utils.commify(treasuryBCTMarketValue)}`,
    circulatingKlima: ethers.utils.commify(Math.round(circulatingKlima * 100)/100),
    bctPerCirculatingKlima: bctPerCirculatingKlima,
    bctPerCirculatingKlimaMV: `$${bctPerCirculatingKlimaMV}`,
    marketValueBackingPerCircKlima: `$${marketValueBackingPerCircKlima}`
  }
}

async function getBackingOfBalance(address) {
  const {marketValueBackingPerCircKlima} = await _getBacking()
  const balance = await _getStakedBalance(address)
  return `$${ethers.utils.commify(Math.round(marketValueBackingPerCircKlima * balance * 100) / 100)}`
}

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

async function daysToGetUSDValue(address, usdValue) {
  const klimaBalance = await _getStakedBalance(address)
  const {USDC_KLIMA} = await getKlimaPrice()
  const {stakingRebase} = await getStakingStats()
  const requiredOhmBalance = usdValue / USDC_KLIMA
  
  const days = Math.log(requiredOhmBalance/klimaBalance) / Math.log(1+stakingRebase) / 3
  let targetDate = new Date()
  targetDate.setDate(targetDate.getDate() + Math.round(days))

  return {usdValue, days, targetDate, klimaBalance: klimaBalance, requiredOhmBalance, stakingRebase, USDC_KLIMA}
}

async function daysToGetKlimaBalance(address, requiredOhmBalance) {
  const klimaBalance = await _getStakedBalance(address)
  const {stakingRebase} = await getStakingStats()
  
  const days = Math.log(requiredOhmBalance/klimaBalance) / Math.log(1+stakingRebase) / 3
  let targetDate = new Date()
  targetDate.setDate(targetDate.getDate() + Math.round(days))

  return {requiredOhmBalance, days, targetDate, klimaBalance, stakingRebase}
}

async function daysToEarnUSD(address, usdValue) {
  const {USDC_KLIMA} = await getKlimaPrice()
  const balance = await getStakedBalance(address)
  const currentValue = balance * USDC_KLIMA
  const requiredValue = parseFloat(usdValue) + currentValue
  const {targetDate, days} = await daysToGetUSDValue(address, requiredValue)

  return {rewardsValueUSD: usdValue, targetDate, days}
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
  daysToGetUSDValue,
  daysToEarnUSD,
  getBacking,
  getBackingOfBalance
  // marketCap
}

// main()
//   .then(() => process.exit(0))
//   .catch((error) => {
//     console.error(error)
//     process.exit(1)
//   })