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
