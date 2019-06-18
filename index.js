BitmexRequest = require('bitmex-request').BitmexRequest
const credentials = require('./bitmex_credentials')
const term = require( 'terminal-kit' ).terminal

const symbol = 'XBTUSD'
const leverage = 25
const units = (x) => x/100000000

const bitmex = new BitmexRequest({
    apiKey: credentials.key,
    apiSecret: credentials.secret,
    testnet: credentials.testnet,
    retryTimes: 2,
})

const data = {
  lastTrade: {},
  wallet: [],
  spread: undefined,
  openOrders: [],
  openPositions: undefined,
  status: 'Init',
}

// Display

term.grabInput()
term.fullscreen(true)
const terminate = (code) => {
  term.grabInput(false)
  term.fullscreen(false)
	term.processExit(code)
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

  begin()('wallet')
  const w = data.wallet.filter(({transactType}) => transactType == 'Total')[0]
  if (w) {
    term(' ').brightBlue(units(w.walletBalance))(' ')(w.currency)
  }
  term('\n')

  const s = data.spread
  begin()('spread ')
  if (s) {
    term.brightGreen(s.lo.price)(' - ').brightRed(s.hi.price)(' ')(symbol)('\n')
  }

  data.openOrders.forEach(({side,price,size,orderQty,symbol}) => {
    begin()('open order ').side(side,side)(' ').side(side,orderQty)(' ')(symbol)(' @ ')(price)('\n')
  })

  const ps = data.openPositions || []
  ps.forEach(({symbol,currentQty,avgEntryPrice,leverage,unrealisedPnl,unrealisedRoePcnt,realisedPnl,markPrice,liquidationPrice,commission}) => {
    begin()('open position ')(symbol)(' ').sign(currentQty)(' x')(leverage)('\n')
    term('  entry ').orange(avgEntryPrice)(' mark ').purple(markPrice)(' liq ').brightRed(liquidationPrice)('\n')
    term('  pnl ').sign(units(unrealisedPnl))('(').sign(unrealisedRoePcnt*100)('%)/').sign(units(realisedPnl))(' comm ').brightRed(commission*100)('%')('\n')
  })

  begin()('\n')(data.status)('\n')

  begin()("'Q'uit")
  if (canBuySell()) {
    term('  ').side('Buy', "'B'uy")('  ').side('Sell', "'S'ell")('\n')
  }
  if (canClose()) {
    term('  ').brightBlue("'C'lose")('\n')
  }
}
const canBuySell = () => (data.wallet.length>0 && data.spread && data.openPositions && data.openPositions.length==0 && data.openOrders.length==0)
const canClose = () => (data.spread && data.openPositions && data.openPositions.length==1 && data.openOrders.length==0)
term.on('key', (name, matches, data) => {
  const is = (c) => name == c
	if (is('CTRL_C') || is('q')) { terminate() }
  if (canBuySell() && is('b')) { buy() }
  if (canBuySell() && is('s')) { sell() }
  if (canClose() && is('c')) { close() }
})

// Actions

const limit = (side, qty, price, id) => {
  return bitmex.request('POST', '/order', {
      ordType: 'Limit', clOrdID: `${id} ${Date.now()}`, symbol: symbol,
      side: side, orderQty: qty, price: price
    }).then(display).catch(console.error)
}

const setLeverage = () => {
  return bitmex.request('POST', '/position/leverage', { symbol: symbol, leverage: leverage }).catch(console.error)
}

const buy = () => {
  data.status = `Buying`
  display()
  setLeverage().then(() => {
    const price = data.spread.lo.price
    const w = data.wallet.filter(({transactType}) => transactType == 'Total')[0]
    const qty = units(w.walletBalance)*leverage*price/2
    data.status = `Buying ${qty} at ${price}`
    const done = () => data.status = 'Buy order placed'
    // limit('Buy', qty, price, 'User Buy Order').then(() => fetchPositionStatus().then(done).then(display))
  })
}

// Data fetch

const fetchWallet = () => {
  return bitmex.request('GET', '/user/walletSummary', {  })
    .then(w => { data.wallet = w }).then(display).catch(console.error)
}

const fetchOrderBook = () => {
  return Promise.all([
    bitmex.request('GET', '/trade', { symbol: symbol, count: 1, reverse:'true' })
      .then(([t]) => { data.lastTrade = t }),
    bitmex.request('GET', '/orderBook/L2', { symbol: symbol, depth: 1 })
      .then(([o1,o2]) => { data.spread = {lo:o2,hi:o1} }),
  ]).then(display).catch(console.error)
}

const fetchPositionStatus = () => {
  return Promise.all([
    bitmex.request('GET', '/order', { filter: '{"open": true}', reverse: true })
      .then(orders => { data.openOrders = orders }),
    bitmex.request('GET', '/position', { filter: '{"isOpen": true}', reverse: true })
      .then(positions => { data.openPositions = positions }),
  ]).then(display).catch(console.error)
}

display()
fetchWallet(); setInterval(() => fetchWallet(), 60000)
fetchOrderBook(); setInterval(() => fetchOrderBook(), 3000)
fetchPositionStatus(); setInterval(() => fetchPositionStatus(), 10000)
