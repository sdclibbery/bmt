const BitmexRequest = require('bitmex-request').BitmexRequest
const BitMEXClient = require('bitmex-realtime-api')
const credentials = require('./bitmex_credentials')
const term = require( 'terminal-kit' ).terminal
const hsl = require('hsl-to-hex')

// constants

const symbol = 'XBTUSD'
const leverage = 25
const openWalletFraction = 0.5
const stopPxFraction = 0.995
const stopPriceFraction = 0.99

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
const limitOrders = () => data.openOrders.filter(({ordType}) => ordType=='Limit')
const canBuySell = () => (data.wallet.length>0 && data.spread && data.openPositions && data.openPositions.length==0 && data.openOrders.length==0)
const canClose = () => (data.spread && data.openPositions && data.openPositions.length==1 && data.openPositions[0].symbol == symbol && limitOrders().length==0)
const canCancel = () => (data.openOrders && data.openOrders.length>0 && data.openOrders[0].symbol == symbol)

// Display

const clamp = (l, h, x) => Math.min(h, Math.max(l, x))
const display = () => {
  term.side = (side,t) => side=='Sell'?term.brightRed(t):term.brightGreen(t)
  term.sign = (x) => x<0?term.brightRed(x):term.brightGreen(x)
  const begin = () => term.styleReset()

  term.clear().moveTo(1,1)

  begin()(`Testnet: ${credentials.testnet}`)('\n')

  begin()('wallet')(' ').brightBlue(units(walletTotal()))(' ')(walletCurrency())
  term('\n')

  const t = data.lastTrade
  begin()('last ').side(t.side, t.price)(' ')('mark ').magenta(data.markPrice)(' ')(symbol)('\n')

  const s = data.spread
  begin()('spread ')
  if (s) {
    term.brightGreen(s.lo)(' - ').brightRed(s.hi)(' ')(symbol)('\n')
  }

  term.indicator = (x, t) => {
    const hue = 255 * (1 - clamp(-1,1,x)) / 6
    return !x ? term('') : term.colorRgbHex(hsl(hue,100,50), t)
  }
  const midSpreadPrice = !s ? 0 : (s.lo + s.hi)/2
  const markMarkup = (data.markPrice - midSpreadPrice)/midSpreadPrice
  begin().indicator(-markMarkup*250, 'Markup')('\n')

  data.openOrders.forEach(({side,ordType,price,size,stopPx,leavesQty,symbol}) => {
    begin()(`open order ${ordType} `).side(side,side)(' ').side(side,leavesQty)(' ')(symbol)(' @ ')(price)(' ')(stopPx)('\n')
  })

  const ps = data.openPositions || []
  ps.forEach(({symbol,currentQty,avgEntryPrice,leverage,liquidationPrice}) => {
    const pnl = (midSpreadPrice - avgEntryPrice) * currentQty
    begin()('open position ')(symbol)(' ').sign(currentQty)(' x')(leverage)('\n')
    term('  entry ').yellow(avgEntryPrice)(' liq ').brightRed(liquidationPrice)('\n')
    term('  pnl ').sign(units(pnl))('\n')
  })

  begin()('\n').grey()(data.status)('\n')

  begin()("'Q'uit")
  if (canBuySell()) {
    term('  ').side('Buy', "'B'uy")('  ').side('Sell', "'S'ell")
  }
  if (canClose()) {
    term('  ').brightBlue("'C'lose")
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
      ordType: 'Limit', clOrdID: id, symbol: symbol, displayQty: 0,
      side: side, orderQty: qty, price: price
    }).catch(error('limit'))
}

const closePosition = (price, baseId) => {
  const id = `${baseId} ${Date.now()}`
  status(`Closing at ${price}\n  '${id}'`)
  return bitmex.request('POST', '/order', {
      ordType: 'Limit', clOrdID: id, symbol: symbol,
      price: price, execInst: 'Close'
    }).catch(error('closePosition'))
}

const setStopClose = (side, stopPx, price) => {
  stopPx = Math.round(stopPx)
  price = Math.round(price)
  const id = `StopClose ${Date.now()}`
  status(`StopClose ${side} at ${stopPx} 4 ${price}\n  '${id}'`)
  return bitmex.request('POST', '/order', {
      ordType: 'StopLimit', clOrdID: id, symbol: symbol,
      side: side, stopPx: stopPx, price: price, execInst: 'Close'
    }).catch(error('setStopClose'))
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
  limit(qty, price, 'UpdateMe')
    .then(() => setStopClose('Sell', price*stopPxFraction, price*stopPriceFraction))
    .then(fetchOrders)
}

const sell = () => {
  status(`Selling ${symbol}`)
  const price = data.spread.hi
  const qty = -Math.floor(units(walletTotal())*leverage*price*openWalletFraction)
  limit(qty, price, 'UpdateMe')
    .then(() => setStopClose('Buy', price/stopPxFraction, price/stopPriceFraction))
    .then(fetchOrders)
}

const close = () => {
  status(`Closing ${symbol} position`)
  const qty = -data.openPositions[0].currentQty
  const price = (qty > 0) ? data.spread.lo : data.spread.hi
  closePosition(price, 'UpdateMe Close').then(fetchOrders)
}

const cancel = () => {
  status(`Cancelling orders`)
  Promise.all(data.openOrders.map(({clOrdID}) => {
    log(`Cancelled '${clOrdID}'`)
    return cancelOrder(clOrdID)
  })).then(fetchOrders)
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
fetchWallet(); setInterval(fetchWallet, 10000)

bitmexWs.addStream(symbol, 'trade', function (res, symbol, tableName) {
  if (!res.length) return
  const trade = res[res.length - 1]
  data.lastTrade = trade
})

bitmexWs.addStream(symbol, 'quote', function (res, symbol, tableName) {
  if (!res.length) return
  const quote = res[res.length - 1]
  data.spread = {lo:quote.bidPrice, hi:quote.askPrice}
  updateOrders()
  display()
})

bitmexWs.addStream(symbol, 'instrument', function (res, symbol, tableName) {
  if (!res.length) return
  const instrument = res[res.length - 1]
  data.markPrice = instrument.markPrice
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
fetchWallet(); setInterval(fetchOrders, 5000)
bitmexWs.addStream(symbol, 'order', function (orders, symbol, tableName) {
  data.openOrders = orders.filter(({ordStatus}) => ordStatus == 'New')
})
