BitmexRequest = require('bitmex-request').BitmexRequest
const credentials = require('./bitmex_credentials')
const term = require( 'terminal-kit' ).terminal

const symbol = 'XBTUSD'
const leverage = 25
const openWalletFraction = 0.5

const units = (x) => x/100000000

const bitmex = new BitmexRequest({
    apiKey: credentials.key,
    apiSecret: credentials.secret,
    testnet: credentials.testnet,
    retryTimes: 2,
})

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
const display = () => {
  term.side = (side,t) => side=='Sell'?term.brightRed(t):term.brightGreen(t)
  term.sign = (x) => x<0?term.brightRed(x):term.brightGreen(x)
  term.orange = term.color('orange')
  term.purple = term.color('purple')
  const begin = () => term.styleReset()

  term.clear().moveTo(1,1)

  begin()(`Testnet: ${credentials.testnet}`)('\n')

  const t = data.lastTrade
  begin()('last price ').side(t.side, t.price)(' ')(symbol)('\n')

  begin()('wallet')(' ').brightBlue(units(walletTotal()))(' ')(walletCurrency())
  term('\n')

  const s = data.spread
  begin()('spread ')
  if (s) {
    term.brightGreen(s.lo.price)(' - ').brightRed(s.hi.price)(' ')(symbol)('\n')
  }

  data.openOrders.forEach(({side,price,size,leavesQty,symbol}) => {
    begin()('open order ').side(side,side)(' ').side(side,leavesQty)(' ')(symbol)(' @ ')(price)('\n')
  })

  const ps = data.openPositions || []
  ps.forEach(({symbol,currentQty,avgEntryPrice,leverage,unrealisedPnl,unrealisedRoePcnt,realisedPnl,markPrice,liquidationPrice,commission}) => {
    begin()('open position ')(symbol)(' ').sign(currentQty)(' x')(leverage)('\n')
    term('  entry ').orange(avgEntryPrice)(' mark ').purple(markPrice)(' liq ').brightRed(liquidationPrice)('\n')
    term('  pnl ').sign(units(unrealisedPnl))('(').sign(Math.round(unrealisedRoePcnt*100))('%)/').sign(units(realisedPnl))(' comm ').brightRed(commission*100)('%')('\n')
  })

  begin()('\n')(data.status)('\n')

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
term.on('key', (name, matches, data) => {
  const is = (c) => name == c
	if (is('CTRL_C') || is('q')) { terminate() }
  if (canBuySell() && is('b')) { buy() }
  if (canBuySell() && is('s')) { sell() }
  if (canClose() && is('c')) { close() }
  if (canCancel() && is('n')) { cancel() }
})

// api calls

const setLeverage = () => {
  return bitmex.request('POST', '/position/leverage', { symbol: symbol, leverage: leverage }).catch(error('setLeverage'))
}

const limit = (qty, price, baseId) => {
  const side = qty>0 ? 'Buy' : 'Sell'
  const id = `${baseId} ${side} ${Date.now()}`
  status(`Limit ${side} ${qty} at ${price}\n  '${id}''`)
  return bitmex.request('POST', '/order', {
      ordType: 'Limit', clOrdID: id, symbol: symbol,
      side: side, orderQty: qty, price: price
    }).then(fetchOrders()).then(display).catch(error('limit'))
}

const setOrderPrice = (clOrdID, newPrice) => {
  status(`Updating\n  '${clOrdID}' to ${newPrice}`)
}

const cancelOrder = (clOrdID) => {
  status(`Cancelling\n  '${clOrdID}'`)
  return bitmex.request('DELETE', '/order', { clOrdID: clOrdID }).catch(error('cancel'))
}

// Actions

const buy = () => {
  status(`Buying ${symbol}`)
  Promise.all([fetchSpread(), setLeverage()]).then(() => {
    const price = data.spread.lo.price
    const qty = Math.floor(units(walletTotal())*leverage*price*openWalletFraction)
    limit(qty, price, 'UpdateMe').then(() => {
      fetchOrders().then(() => status('Buy order placed'))
    })
  })
}

const sell = () => {
  status(`Selling ${symbol}`)
  Promise.all([fetchSpread(), setLeverage()]).then(() => {
    const price = data.spread.lo.price
    const qty = -Math.floor(units(walletTotal())*leverage*price*openWalletFraction)
    limit(qty, price, 'UpdateMe').then(() => {
      fetchOrders().then(() => status('Sell order placed'))
    })
  })
}

const close = () => {
  status(`Closing ${symbol} position`)
  fetchSpread().then(() => {
    const qty = -data.openPositions[0].currentQty
    const price = data.spread.hi.price
    limit(qty, price, 'UpdateMe Close').then(() => {
      fetchOrders().then(() => status('Close order placed'))
    })
  })
}

const cancel = () => {
  const clOrdID = data.openOrders[0].clOrdID
  cancelOrder(clOrdID).then(fetchOrders())
  status(`Cancelled '${clOrdID}'`)
}

const updateOrders = () => {
  data.openOrders
    .filter(({clOrdID}) => clOrdID.startsWith('UpdateMe'))
    .forEach(({clOrdID, price, orderQty}) => {
      const newPrice = (orderQty > 0) ? data.spread.lo.price : data.spread.hi.price
      if (price != newPrice) {
        setOrderPrice(clOrdID, newPrice)
      }
    })
}

// Data fetch

const fetchWallet = () => {
  return bitmex.request('GET', '/user/walletSummary', {  })
    .then(w => { data.wallet = w }).then(display).catch(error('fetchWallet'))
}

const fetchRecentPrice = () => {
  return bitmex.request('GET', '/trade', { symbol: symbol, count: 1, reverse:'true' })
    .then(([t]) => { data.lastTrade = t }).then(display).catch(error('fetchRecentPrice'))
}

const fetchSpread = () => {
  return bitmex.request('GET', '/orderBook/L2', { symbol: symbol, depth: 1 })
      .then(([o1,o2]) => { data.spread = {lo:o2,hi:o1} })
      .then(updateOrders)
      .then(display).catch(error('fetchSpread'))
}

const fetchPositions = () => {
  return bitmex.request('GET', '/position', { filter: '{"isOpen": true}', reverse: true })
    .then(positions => { data.openPositions = positions }).then(display).catch(error('fetchPositions'))
}

const fetchOrders = () => {
  return bitmex.request('GET', '/order', { filter: '{"open": true}', reverse: true })
      .then(orders => { data.openOrders = orders })
      .then(display).catch(error('fetchOrders'))
}

display()
fetchWallet(); setInterval(() => fetchWallet(), 60000)
fetchRecentPrice(); setInterval(() => fetchRecentPrice(), 10000)
fetchSpread(); setInterval(() => fetchSpread(), 2000)
fetchPositions(); setInterval(() => fetchPositions(), 10000)
fetchOrders(); setInterval(() => fetchOrders(), 5000)
