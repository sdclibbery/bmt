const BitmexRequest = require('bitmex-request').BitmexRequest
const BitMEXClient = require('bitmex-realtime-api');
const credentials = require('./bitmex_credentials')
const term = require( 'terminal-kit' ).terminal

// constants

const symbol = 'XBTUSD'
const leverage = 25
const openWalletFraction = 0.5

// terminal setup and logging

term.grabInput()
term.fullscreen(true)
const terminate = (code) => {
  term.grabInput(false)
  term.fullscreen(false)
	term.processExit(code)
}
const error = (context) => (...args) => {
  term.fullscreen(false)
  console.error(context, ...args)
  term.fullscreen(true)
}
const log = (...args) => {
  term.fullscreen(false)
  console.log(...args)
  term.fullscreen(true)
}

// Bitmex clients

const bitmexWs = new BitMEXClient({
    apiKeyID: credentials.key,
    apiKeySecret: credentials.secret,
    testnet: credentials.testnet,
})
bitmexWs.on('error', error('BitMEX websocket'))
const bitmex = new BitmexRequest({
    apiKey: credentials.key,
    apiSecret: credentials.secret,
    testnet: credentials.testnet,
    retryTimes: 2,
})
bitmex.request('POST', '/position/leverage', { symbol: symbol, leverage: leverage }).then(log('Set leverage')).catch(error('setLeverage'))

const units = (x) => x/100000000

// Data

const data = {
  lastTrade: {},
  wallet: [],
  spread: undefined,
  openOrders: [],
  openPositions: undefined,
  status: 'Init',
}
const status = (s) => { log(s); data.status = s; display(); }
const walletTotal = () => (((data.wallet.filter(({transactType}) => transactType == 'Total')[0]) || {}).walletBalance)
const walletCurrency = () => ((data.wallet[0] || {}).currency)
const canBuySell = () => (data.wallet.length>0 && data.spread && data.openPositions && data.openPositions.length==0 && data.openOrders.length==0)
const canClose = () => (data.spread && data.openPositions && data.openPositions.length==1 && data.openPositions[0].symbol == symbol && data.openOrders.length==0)
const canCancel = () => (data.openOrders && data.openOrders.length==1 && data.openOrders[0].symbol == symbol)

// Display

const display = () => {
  term.side = (side,t) => side=='Sell'?term.brightRed(t):term.brightGreen(t)
  term.sign = (x) => x<0?term.brightRed(x):term.brightGreen(x)
  const begin = () => term.styleReset()

  term.clear().moveTo(1,1)

  begin()(`Testnet: ${credentials.testnet}`)('\n')

  const t = data.lastTrade
  begin()('last ').side(t.side, t.price)(' ')('mark ').magenta(data.markPrice)(' ')(symbol)('\n')

  begin()('wallet')(' ').brightBlue(units(walletTotal()))(' ')(walletCurrency())
  term('\n')

  const s = data.spread
  begin()('spread ')
  if (s) {
    term.brightGreen(s.lo)(' - ').brightRed(s.hi)(' ')(symbol)('\n')
  }

  data.openOrders.forEach(({side,price,size,leavesQty,symbol}) => {
    begin()('open order ').side(side,side)(' ').side(side,leavesQty)(' ')(symbol)(' @ ')(price)('\n')
  })

  const ps = data.openPositions || []
  ps.forEach(({symbol,currentQty,avgEntryPrice,leverage,unrealisedPnl,unrealisedRoePcnt,realisedPnl,markPrice,liquidationPrice,commission}) => {
    begin()('open position ')(symbol)(' ').sign(currentQty)(' x')(leverage)('\n')
    term('  entry ').yellow(avgEntryPrice)(' mark ').magenta(markPrice)(' liq ').brightRed(liquidationPrice)('\n')
    term('  pnl ').sign(units(unrealisedPnl))('(').sign(Math.round(unrealisedRoePcnt*100))('%)/').sign(units(realisedPnl))(' comm ').brightRed(commission*100)('%')('\n')
  })

  begin()('\n').grey()(data.status)('\n')

  begin()("'Q'uit")
  if (canBuySell()) {
    term('  ').side('Buy', "'B'uy")('  ').side('Sell', "'S'ell")('\n')
  }
  if (canClose()) {
    term('  ').brightBlue("'C'lose")('\n')
  }
  if (canCancel()) {
    term('  ').brightBlue("Ca'n'cel")
  }
}
display()
term.on('key', (name, matches, data) => {
  const is = (c) => name == c
	if (is('CTRL_C') || is('q')) { terminate() }
  if (canBuySell() && is('b')) { buy() }
  if (canBuySell() && is('s')) { sell() }
  if (canClose() && is('c')) { close() }
  if (canCancel() && is('n')) { cancel() }
})

// api calls

const limit = (qty, price, baseId) => {
  const side = qty>0 ? 'Buy' : 'Sell'
  const id = `${baseId} ${side} ${Date.now()}`
  status(`Limit ${side} ${qty} at ${price}\n  '${id}'`)
  return bitmex.request('POST', '/order', {
      ordType: 'Limit', clOrdID: id, symbol: symbol,
      side: side, orderQty: qty, price: price
    }).catch(error('limit'))
}

const setOrderPrice = (clOrdID, newPrice) => {
  status(`Updating\n  '${clOrdID}' to ${newPrice}`)
  return bitmex.request('PUT', '/order', { origClOrdID: clOrdID, price: newPrice }).catch(e => {
      if (e.toString().includes('Invalid ordStatus')) {
        log(`Invalid ordStatus: removing order\n  ${clOrdID}`)
        data.openOrders = data.openOrders.filter(o => o.clOrdID != clOrdID)
        display()
      } else {
        error('setOrderPrice')(e)
      }
    })
}

const cancelOrder = (clOrdID) => {
  status(`Cancelling\n  '${clOrdID}'`)
  return bitmex.request('DELETE', '/order', { clOrdID: clOrdID }).catch(error('cancelOrder'))
}

// Actions

const buy = () => {
  status(`Buying ${symbol}`)
  const price = data.spread.lo
  const qty = Math.floor(units(walletTotal())*leverage*price*openWalletFraction)
  limit(qty, price, 'UpdateMe').then(fetchOrders)
}

const sell = () => {
  status(`Selling ${symbol}`)
  const price = data.spread.hi
  const qty = -Math.floor(units(walletTotal())*leverage*price*openWalletFraction)
  limit(qty, price, 'UpdateMe').then(fetchOrders)
}

const close = () => {
  status(`Closing ${symbol} position`)
  const qty = -data.openPositions[0].currentQty
  const price = (qty > 0) ? data.spread.lo : data.spread.hi
  limit(qty, price, 'UpdateMe Close').then(fetchOrders)
}

const cancel = () => {
  const clOrdID = data.openOrders[0].clOrdID
  cancelOrder(clOrdID).then(fetchOrders)
  status(`Cancelled '${clOrdID}'`)
}

const updateOrders = () => {
  data.openOrders
    .filter(({clOrdID}) => clOrdID.startsWith('UpdateMe'))
    .forEach(o => {
      const newPrice = (o.orderQty > 0) ? data.spread.lo : data.spread.hi
      if (o.price != newPrice) {
        setOrderPrice(o.clOrdID, newPrice)
        o.price = newPrice
      }
    })
}

// Data fetch

const fetchWallet = () => {
  return bitmex.request('GET', '/user/walletSummary', {  })
    .then(w => { data.wallet = w }).then(display).catch(error('fetchWallet'))
}
bitmexWs.addStream(symbol, 'wallet', function (wallet, symbol, tableName) { fetchWallet() })

bitmexWs.addStream(symbol, 'trade', function (res, symbol, tableName) {
  if (!res.length) return
  const trade = res[res.length - 1]
  data.lastTrade = trade
})

bitmexWs.addStream(symbol, 'instrument', function (res, symbol, tableName) {
  if (!res.length) return
  const instrument = res[res.length - 1]
  data.markPrice = instrument.markPrice
  data.spread = {lo: instrument.bidPrice, hi: instrument.askPrice}
  updateOrders()
  display()
})

bitmexWs.addStream(symbol, 'position', function (positions, symbol, tableName) {
  data.openPositions = positions.filter(({isOpen}) => isOpen)
  display()
})

const fetchOrders = () => {
  return bitmex.request('GET', '/order', { filter: '{"open": true}', reverse: true })
    .then(orders => { data.openOrders = orders })
    .then(display).catch(error('fetchOrders'))
}
fetchOrders(); setInterval(fetchOrders, 10000)
bitmexWs.addStream(symbol, 'order', function (orders, symbol, tableName) {
  orders.filter(({ordStatus}) => ordStatus == 'Filled').forEach(o => {
    data.openOrders = data.openOrders.filter(({clOrdID}) => clOrdID != o.clOrdID)
  })
})
