BitmexRequest = require('bitmex-request').BitmexRequest
const credentials = require('./bitmex_credentials')

const symbol = 'XBTUSD'

const bitmex = new BitmexRequest({
    apiKey: credentials.key,
    apiSecret: credentials.secret,
    testnet: true,
    retryTimes: 2,
})

bitmex.request('GET', '/trade', { symbol: symbol, count: 1, reverse:'true' })
  .then(([{price}]) => {
    console.log(`last price ${price} ${symbol}`)
  }).catch(console.log)

bitmex.request('GET', '/user/walletSummary', {  })
  .then(types => {
    types.map(({transactType,walletBalance,currency}) => {
      console.log(`wallet ${transactType} ${walletBalance} ${currency}`)
    })
  }).catch(console.log)

bitmex.request('GET', '/orderBook/L2', { symbol: symbol, depth: 1 })
  .then(([o1,o2]) => {
    console.log(`spread ${o2.price} - ${o1.price} ${symbol}`)
  }).catch(console.log)

// Colour based on side
bitmex.request('GET', '/order', { filter: '{"open": true}', reverse: true })
  .then(orders => {
    orders.map(({side,price,size,orderQty,symbol,transactTime}) => {
      console.log(`open order ${side} ${orderQty} ${symbol} @ ${price} @ ${transactTime}`)
    })
  }).catch(console.log)

//Colour based on sign of currentQty
bitmex.request('GET', '/position', { filter: '{"isOpen": true}', reverse: true })
  .then(positions => {
    positions.map(({symbol,currentQty,avgEntryPrice,leverage,unrealisedPnl,unrealisedRoePcnt,realisedPnl,markPrice,liquidationPrice,commission}) => {
      console.log(`open position ${symbol} ${currentQty} x${leverage} entry ${avgEntryPrice} mark ${markPrice} liq ${liquidationPrice} pnl ${unrealisedPnl}(${unrealisedRoePcnt*100}%)/${realisedPnl} comm ${commission}`)
    })
  }).catch(console.log)
