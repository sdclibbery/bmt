BitmexRequest = require('bitmex-request').BitmexRequest
const credentials = require('./bitmex_credentials')
const c = require('chalk')

const symbol = 'XBTUSD'

const bitmex = new BitmexRequest({
    apiKey: credentials.key,
    apiSecret: credentials.secret,
    testnet: credentials.testnet,
    retryTimes: 2,
})

const data = {
  lastTrade: {},
  wallet: [],
  spread: {lo:{},hi:{}},
  openOrders: [],
  openPositions: [],
}

const display = () => {
  c.side = (side,t) => side=='Sell'?c.redBright(t):c.greenBright(t)
  c.sign = (x) => x<0?c.redBright(x):c.greenBright(x)
  c.orange = c.keyword('orange')
  c.purple = c.keyword('purple')
  const units = (x) => x/100000000

  console.log('\033[8S\033[2J\033[1;1H')
  console.log(`Testnet: ${credentials.testnet}`)
  const t = data.lastTrade
  console.log(`last price ${c.side(t.side, t.price)} ${symbol}`)
  console.log(`wallet ${data.wallet.map(({walletBalance,currency}) => `${c.blueBright(units(walletBalance))}${currency}`).join('/')}`)
  const s = data.spread
  console.log(`spread ${c.greenBright(s.lo.price)} - ${c.redBright(s.hi.price)} ${symbol}`)
  data.openOrders.map(({side,price,size,orderQty,symbol}) => {
    console.log(`open order ${c.side(side,side)} ${c.side(side,orderQty)} ${symbol} @ ${price}`)
  })
  data.openPositions.map(({symbol,currentQty,avgEntryPrice,leverage,unrealisedPnl,unrealisedRoePcnt,realisedPnl,markPrice,liquidationPrice,commission}) => {
    console.log(
`open position ${symbol} ${c.sign(currentQty)} x${leverage}
  entry ${c.orange(avgEntryPrice)} mark ${c.purple(markPrice)} liq ${c.redBright(liquidationPrice)}
  pnl ${c.sign(units(unrealisedPnl))}(${c.sign(unrealisedRoePcnt*100)}%)/${c.sign(units(realisedPnl))} comm ${c.redBright(commission*100)}%`)
  })
  console.log('')
}

const fetchWallet = () => {
  return bitmex.request('GET', '/user/walletSummary', {  })
    .then(w => { data.wallet = w }).catch(console.log)
}

const fetchOrderBook = () => {
  return Promise.all([
    bitmex.request('GET', '/trade', { symbol: symbol, count: 1, reverse:'true' })
      .then(([t]) => { data.lastTrade = t }),
    bitmex.request('GET', '/orderBook/L2', { symbol: symbol, depth: 1 })
      .then(([o1,o2]) => { data.spread = {lo:o2,hi:o1} }),
  ]).catch(console.log)
}

const fetchPositionStatus = () => {
  return Promise.all([
    bitmex.request('GET', '/order', { filter: '{"open": true}', reverse: true })
      .then(orders => { data.openOrders = orders }),
    bitmex.request('GET', '/position', { filter: '{"isOpen": true}', reverse: true })
      .then(positions => { data.openPositions = positions }),
  ]).catch(console.log)
}

fetchWallet().then(display)
fetchOrderBook().then(display)
fetchPositionStatus().then(display)
