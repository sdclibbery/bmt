BitmexRequest = require('bitmex-request').BitmexRequest
const credentials = require('./bitmex_credentials')
const c = require('chalk')

const symbol = 'XBTUSD'

const bitmex = new BitmexRequest({
    apiKey: credentials.key,
    apiSecret: credentials.secret,
    testnet: true,
    retryTimes: 2,
})

c.side = (side,t) => side=='Sell'?c.redBright(t):c.greenBright(t)
c.sign = (x) => x<0?c.redBright(x):c.greenBright(x)

bitmex.request('GET', '/trade', { symbol: symbol, count: 1, reverse:'true' })
  .then(([{price,side}]) => {
    console.log(`last price ${c.side(side, price)} ${symbol}`)
  }).catch(console.log)

bitmex.request('GET', '/user/walletSummary', {  })
  .then(types => {
    console.log(`wallet ${types.map(({walletBalance,currency}) => `${c.blueBright(walletBalance)}${currency}`).join('/')}`)
  }).catch(console.log)

bitmex.request('GET', '/orderBook/L2', { symbol: symbol, depth: 1 })
  .then(([o1,o2]) => {
    console.log(`spread ${c.greenBright(o2.price)} - ${c.redBright(o1.price)} ${symbol}`)
  }).catch(console.log)

bitmex.request('GET', '/order', { filter: '{"open": true}', reverse: true })
  .then(orders => {
    orders.map(({side,price,size,orderQty,symbol,transactTime}) => {
      console.log(`open order ${side} ${orderQty} ${symbol} @ ${price} @ ${transactTime}`)
    })
  }).catch(console.log)

bitmex.request('GET', '/position', { filter: '{"isOpen": true}', reverse: true })
  .then(positions => {
    positions.map(({symbol,currentQty,avgEntryPrice,leverage,unrealisedPnl,unrealisedRoePcnt,realisedPnl,markPrice,liquidationPrice,commission}) => {
      console.log(
`open position ${symbol} ${c.sign(currentQty)} x${leverage}
  entry ${avgEntryPrice} mark ${markPrice} liq ${liquidationPrice}
  pnl ${c.sign(unrealisedPnl)}(${c.sign(unrealisedRoePcnt*100)}%)/${c.sign(realisedPnl)} comm ${c.redBright(commission)}`)
    })
  }).catch(console.log)
