const BitmexRequest = require('bitmex-request').BitmexRequest
const BitMEXClient = require('bitmex-realtime-api')
const credentials = require('./bitmex_credentials')
const parseOptions = require('./options').parse
const term = require( 'terminal-kit' ).terminal
const logger = require('./logger').createLogger(`bmt.log`)

// Command line Options

const options = parseOptions(logger, [
  { name: 'symbol', alias: 's', type: String, defaultValue: 'XBTUSD', description: 'BitMex market symbol eg XBTUSD, ETHUSD, LTCU19' },
  { name: 'help', alias: 'h', type: Boolean, defaultValue: false, description: 'Show this help' },
])

// constants

const symbol = options.symbol
const leverage = 25
const openWalletFraction = 0.505
const stopPxFraction = 0.995
const riskFraction = 0.9975
const rewardFraction = 1.02
const moveFraction = 0.98
const candleSize = 60*1000
const volumeScale = 1e-5
const velocityRelaxation = 0.9
let tickSize = {"XBTUSD":0.5, "ETHUSD":0.05, "LTCU19":0.000005}[symbol] || 1

// terminal setup and logging

term.grabInput()
term.fullscreen(true)
const terminate = (code) => {
  term.grabInput(false)
  term.fullscreen(false)
	term.processExit(code)
}
const error = (context) => (...args) => {
  logger.sync.error(context, ...args)
  term.fullscreen(false)
  console.error(context, ...args)
  term.fullscreen(true)
}
const log = (...args) => {
  logger.info(...args)
  term.fullscreen(false)
  console.log(...args)
  term.fullscreen(true)
}
log(`Startup ${symbol}`)

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
bitmex.request('POST', '/position/leverage', { symbol: symbol, leverage: leverage }).then(log(`Set leverage x${leverage}`)).catch(error('setLeverage'))

const units = (x) => x/100000000

// Data

const data = {
  lastTrade: {},
  candles: [],
  buyVelocity: 0,
  sellVelocity: 0,
  wallet: [],
  spread: undefined,
  openOrders: [],
  selectedOrderIdx: 0,
  openPositions: undefined,
  status: 'Init',
}
const roundToTickSize = (x) => Number.parseFloat(x).toFixed(Math.floor(-Math.log10(tickSize)))
const status = (s) => { log(s); data.status = s; display(); }
const walletTotalCalc = (wallet) => (((wallet.filter(({transactType}) => transactType == 'Total')[0]) || {}).walletBalance)
const walletTotal = () => walletTotalCalc(data.wallet)
const walletCurrency = () => ((data.wallet[0] || {}).currency)
const selectedOrder = () => data.openOrders[data.selectedOrderIdx]

// Display

const clamp = (l, h, x) => Math.min(h, Math.max(l, x))
let rateLimiter = null
const display = () => {
  if (rateLimiter) { return }
  rateLimiter = setTimeout(() => {
    rateLimiter = null
    reallyDisplay()
  }, 150)
}
term.side = (side,t) => side=='Sell'?term.brightRed(t):term.brightGreen(t)
term.sign = (x) => x<0?term.brightRed(x):term.brightGreen(x)
const scaleVol = v => 0.01 + v*volumeScale/(candleSize/1000)
term.vol = (v) => {
  const x = Math.floor(Math.min(scaleVol(Math.abs(v))*255, 255))
  return term(`\x1b[38;2;${v<0?x:0};${v>0?x:0};0m█`)
}
const reallyDisplay = () => {
  term.clear().moveTo(1,1)

  if (credentials.testnet) {
    term.styleReset()('<TestNet>\n')
  }

  term.styleReset()('wallet')(' ').brightBlue(units(walletTotal()))(' ')(walletCurrency())
  term('\n')

  const t = data.lastTrade
  term.styleReset()('last ').side(t.side, t.price)(' ')('mark ').magenta(data.markPrice)(' ')(symbol)('\n')

  const s = data.spread
  const midSpreadPrice = s ? (s.hi+s.lo)/2 : 0
  term.styleReset()('spread ')
  if (s) {
    term.brightGreen(s.lo)(' - ').brightRed(s.hi)(' ')(symbol)('\n')
  }

  term.styleReset()('velocity ').side('Buy', Math.round(data.buyVelocity))(' ').vol(data.buyVelocity*15).vol(data.buyVelocity*2)
        (' ').vol(-data.sellVelocity*2).vol(-data.sellVelocity*15)(' ').side('Sell', Math.round(data.sellVelocity))('\n')
  const candles = data.candles.slice(-(term.width-1))
  term.styleReset(); candles.forEach(c => term.vol(c.buyVolume)); term('\n')
  term.styleReset(); candles.forEach(c => term.vol(-c.sellVolume)); term('\n')

  term.styleReset()('\n')
  const ps = data.openPositions || []
  ps.forEach(({symbol,currentQty,avgEntryPrice,leverage,liquidationPrice}) => {
    const pnl = (midSpreadPrice - avgEntryPrice) * currentQty
    term.styleReset()('position ')(symbol)(' ').sign(currentQty)(' x')(leverage)('\n')
    term('  entry ').yellow(avgEntryPrice)(' liq ').brightRed(liquidationPrice)('  ±').sign(units(pnl))('\n')
  })

  data.selectedOrderIdx = Math.max(Math.min(data.selectedOrderIdx, data.openOrders.length-1), 0)
  term.styleReset()('\n')
  data.openOrders.forEach(({clOrdID,side,ordType,price,size,stopPx,leavesQty,symbol, triggered}, idx) => {
    term.styleReset()
    if (idx == data.selectedOrderIdx) { term.bgColorGrayscale(50) }
    const bits = clOrdID.split(' ')
    const id = bits[0]=='UpdateMe' ? bits[1] : bits[0]
    term.side(side,`${id} `).side(side,side)(' ').side(side,leavesQty)(' ')(symbol)(' @ ')(stopPx)(' ')(price)(`${stopPx?(triggered?' o_o':' Zz'):' '}`)('\n')
  })

  term.styleReset()('\n').grey()(data.status)('\n')

  term.styleReset()
  actions.forEach(({active, display}) => active() && display())
}
display()

term.on('key', (name, matches, data) => {
  actions.forEach(({active, parse}) => {
    const action = parse(name)
    if (active() && action) {
      action()
      display()
    }
  })
})
const actions = [
  { // Quit
    active: () => true,
    display: () => term("'Q'uit"),
    parse: key => { return {q:terminate, 'CTRL_C':terminate,}[key] },
  },
  { // BuySell - open position
    active: () => (data.wallet.length>0 && data.spread && data.openPositions && data.openPositions.length==0 && data.openOrders.length==0),
    display: () => term.side('Buy', " 'b'uy").side('Sell', " 's'ell").side('Buy', " 'B'uyNow").side('Sell', " 'S'ellNow"),
    parse: key => { return {b:buy, s:sell, B:buyNow, S:sellNow,}[key] },
  },
  { // Close position
    active: () => (data.spread && data.openPositions && data.openPositions.length==1 && data.openPositions[0].symbol == symbol),
    display: () => term.wrap("  ^B'c'lose").wrap("  ^B'C'loseNow"),
    parse: key => { return {c:close, C:closeNow,}[key] },
  },
  { // Cancel order
    active: () => !!selectedOrder(),
    display: () => term.wrap("  ^BCa'n'cel"),
    parse: key => { return {n:cancel,}[key] },
  },
  { // Cancel all orders
    active: () => data.openOrders.length>1,
    display: () => term.wrap("  ^BCa'N'celAll"),
    parse: key => { return {N:cancelAll,}[key] },
  },
  { // Move order up/down
    active: () => !!selectedOrder(),
    display: () => term.wrap("  ^MOrder'Uu'p Order'Dd'own"),
    parse: key => { return {U:()=>orderUp(5), u:()=>orderUp(1), D:()=>orderDown(5), d:()=>orderDown(1),}[key] },
  },
  { // Order selection up
    active: () => data.selectedOrderIdx > 0,
    display: () => term.bgColorGrayscale(40).wrap("  ^W↑"),
    parse: key => { return {'UP':() => data.selectedOrderIdx-=1,}[key] },
  },
  { // Order selection down
    active: () => data.selectedOrderIdx < data.openOrders.length-1,
    display: () => term.bgColorGrayscale(40).wrap("  ^W↓"),
    parse: key => { return {'DOWN':() => data.selectedOrderIdx+=1,}[key] },
  },
]

// Actions

const buy = () => {
  status(`Buying ${symbol}`)
  const price = data.spread.lo
  const qty = roundToTickSize(units(walletTotal())*leverage*price*openWalletFraction)
  limit(qty, price, `UpdateMe Open Buy`)
    .then(() => {
      stopClose('Sell', roundToTickSize(price*stopPxFraction))
      stopLimitClose('Sell', roundToTickSize(price*riskFraction), roundToTickSize(price*riskFraction)+tickSize*5, 'UpdateMe Risk Sell')
      limitCloseIfTouched('Sell', roundToTickSize(price*Math.pow(rewardFraction, 0.8)), roundToTickSize(price*rewardFraction), 'Reward Sell')
    })
    .then(fetchOrders)
}

const sell = () => {
  status(`Selling ${symbol}`)
  const price = data.spread.hi
  const qty = -roundToTickSize(units(walletTotal())*leverage*price*openWalletFraction)
  limit(qty, price, `UpdateMe Open Sell`)
    .then(() => {
      stopClose('Buy', roundToTickSize(price/stopPxFraction))
      stopLimitClose('Buy', roundToTickSize(price/riskFraction), roundToTickSize(price/riskFraction)-tickSize*5, 'UpdateMe Risk Buy')
      limitCloseIfTouched('Buy', roundToTickSize(price/Math.pow(rewardFraction, 0.8)), roundToTickSize(price/rewardFraction), 'Reward Buy')
    })
    .then(fetchOrders)
}

const buyNow = () => {
  status(`Buying ${symbol} now`)
  const price = data.spread.lo
  const qty = roundToTickSize(units(walletTotal())*leverage*price*openWalletFraction)
  market(qty)
    .then(() => stopClose('Sell', roundToTickSize(price*stopPxFraction)))
    .then(fetchOrders)
}

const sellNow = () => {
  status(`Selling ${symbol} now`)
  const price = data.spread.hi
  const qty = -roundToTickSize(units(walletTotal())*leverage*price*openWalletFraction)
  market(qty)
    .then(() => stopClose('Buy', roundToTickSize(price/stopPxFraction)))
    .then(fetchOrders)
}

const orderUp = (speed) => {
  const o = selectedOrder()
  const newPrice = o.price && roundToTickSize(o.price / Math.pow(moveFraction, speed/20))
  const newStopPx = o.stopPx && roundToTickSize(o.stopPx / Math.pow(moveFraction, speed/20))
  return setOrderPrice(o.clOrdID, newPrice, newStopPx).then(fetchOrders)
}

const orderDown = (speed) => {
  const o = selectedOrder()
  const newPrice = o.price && roundToTickSize(o.price * Math.pow(moveFraction, speed/20))
  const newStopPx = o.stopPx && roundToTickSize(o.stopPx * Math.pow(moveFraction, speed/20))
  return setOrderPrice(o.clOrdID, newPrice, newStopPx).then(fetchOrders)
}

const close = () => {
  status(`Closing ${symbol} position`)
  const qty = -data.openPositions[0].currentQty
  const side = (qty > 0) ? 'Buy' : 'Sell'
  const price = (side == 'Buy') ? data.spread.lo : data.spread.hi
  closePosition(price, `UpdateMe Close ${side}`).then(fetchOrders)
}

const closeNow = () => {
  status(`Closing ${symbol} position now`)
  const qty = -data.openPositions[0].currentQty
  const price = (qty > 0) ? data.spread.lo : data.spread.hi
  closePositionNow(price).then(fetchOrders)
}

const cancel = () => {
  return cancelOrder(selectedOrder().clOrdID).then(fetchOrders)
}

const cancelAll = () => {
  Promise.all(data.openOrders.map(o => cancelOrder(o.clOrdID))).then(fetchOrders)
}

const updateOrders = () => {
  data.openOrders
    .filter(({clOrdID}) => clOrdID.startsWith('UpdateMe'))
    .forEach(o => {
      const newPrice = o.clOrdID.includes('Buy') ? data.spread.lo : data.spread.hi
      if (o.price != newPrice) {
        setOrderPrice(o.clOrdID, newPrice)
        o.price = newPrice
      }
    })
}

// api calls

const dateId = () => Math.floor((Date.now())/1000)

const limit = (qty, price, baseId) => {
  const side = qty>0 ? 'Buy' : 'Sell'
  const id = `${baseId} Limit ${dateId()}`
  status(`Limit ${side} ${qty} at ${price} '${id}'`)
  return bitmex.request('POST', '/order', {
      ordType: 'Limit', clOrdID: id, symbol: symbol, displayQty: 0,
      side: side, orderQty: qty, price: price, execInst: 'ParticipateDoNotInitiate'
    }).catch(error('limit'))
}

const market = (qty) => {
  const side = qty>0 ? 'Buy' : 'Sell'
  const id = `Market ${side} ${dateId()}`
  status(`Market ${side} ${qty}`)
  return bitmex.request('POST', '/order', {
      ordType: 'Market', clOrdID: id, symbol: symbol,
      side: side, orderQty: qty
    }).catch(error('market'))
}

const closePosition = (price, baseId) => {
  const id = `${baseId} ${dateId()}`
  status(`Closing at ${price} '${id}'`)
  return bitmex.request('POST', '/order', {
      ordType: 'Limit', clOrdID: id, symbol: symbol,
      price: price, execInst: 'Close,ParticipateDoNotInitiate'
    }).catch(error('closePosition'))
}

const closePositionNow = (price, now) => {
  const id = `CloseNow ${dateId()}`
  status(`Closing now at ${price} '${id}'`)
  return bitmex.request('POST', '/order', {
      ordType: 'Market', clOrdID: id, symbol: symbol,
      execInst: 'Close'
    }).catch(error('closePosition'))
}

const stopClose = (side, stopPx) => {
  const id = `StopClose ${dateId()}`
  status(`StopClose ${side} at ${stopPx} '${id}'`)
  return bitmex.request('POST', '/order', {
      ordType: 'Stop', clOrdID: id, symbol: symbol,
      side: side, stopPx: stopPx, execInst: 'Close,LastPrice'
    }).catch(error('stopClose'))
}

const stopLimitClose = (side, stopPx, price, baseId) => {
  const id = `${baseId} ${dateId()}`
  status(`StopLimitClose ${side} at ${stopPx} for ${price} '${id}'`)
  return bitmex.request('POST', '/order', {
      ordType: 'StopLimit', clOrdID: id, symbol: symbol,
      side: side, price: price, stopPx: stopPx, execInst: 'Close,LastPrice'
    }).catch(error('stopLimitClose'))
}

const limitCloseIfTouched = (side, stopPx, price, baseId) => {
  const id = `${baseId} ${dateId()}`
  status(`limitCloseIfTouched ${side} at ${stopPx} for ${price}\n  '${id}'`)
  return bitmex.request('POST', '/order', {
      ordType: 'LimitIfTouched', clOrdID: id, symbol: symbol,
      side: side, price: price, stopPx: stopPx, execInst: 'Close,LastPrice'
    }).catch(error('limitCloseIfTouched'))
}

const setOrderPrice = (clOrdID, newPrice, newStopPx) => {
  status(`Updating  '${clOrdID}' ${newStopPx||''} for ${newPrice||''}`)
  return bitmex
    .request('PUT', '/order', { origClOrdID: clOrdID , price: newPrice, stopPx: newStopPx })
    .catch(handleOrderUpdateError('setOrderPrice'))
}

const setStopPx = (clOrdID, newStopPx) => {
  status(`Updating\n  '${clOrdID}' to ${newStopPx}`)
  return bitmex.request('PUT', '/order', { origClOrdID: clOrdID, stopPx: newStopPx }).catch(handleOrderUpdateError('setStopPx'))
}

const handleOrderUpdateError = (context) => e => {
  if (e.toString().includes('Invalid ordStatus')) {
    log(`${context}: Invalid ordStatus: removing order ${clOrdID}`)
    data.openOrders = data.openOrders.filter(o => o.clOrdID != clOrdID)
    display()
  } else {
    error(context)(e)
  }
}

const cancelOrder = (clOrdID) => {
  status(`Cancelling '${clOrdID}'`)
  data.openOrders = data.openOrders.filter(o => o.clOrdID != clOrdID)
  return bitmex.request('DELETE', '/order', { clOrdID: clOrdID }).catch(error('cancelOrder'))
}

// Data fetch

const fetchWallet = () => {
  return bitmex.request('GET', '/user/walletSummary', {  })
    .then(w => {
      const oldTotal = walletTotal()
      const newTotal = walletTotalCalc(w)
      if (!!oldTotal && newTotal != oldTotal) {
        log(`Wallet total change ${oldTotal} -> ${newTotal}`)
      }
      data.wallet = w
    }).then(display).catch(error('fetchWallet'))
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
  const prevCount = (data.openPositions || []).length
  data.openPositions = positions.filter(({isOpen}) => isOpen)
  display()
  if (prevCount != data.openPositions.length) { fetchOrders() }
})

const fetchOrders = () => {
  return bitmex.request('GET', '/order', { filter: '{"open": true}', reverse: true })
    .then(orders => { data.openOrders = orders })
    .then(display).catch(error('fetchOrders'))
}
fetchOrders(); setInterval(fetchOrders, 3000)

bitmexWs.addStream(symbol, 'trade', function (res, symbol, tableName) {
  res.forEach(t => {
    const timestamp = Date.parse(t.timestamp)
    const price = parseFloat(t.price)
    const size = parseFloat(t.size)
    let candle = data.candles[data.candles.length-1]
    if (!candle || candle.openTimestamp < timestamp - candleSize) {
      if (candle) { candle.close = candle.last }
      candle = {
        openTimestamp: candle ? candle.openTimestamp+candleSize : timestamp,
        timestamp: timestamp,
        open: candle ? candle.close : price,
        low: price, high: price,
        buyVolume: 0, sellVolume: 0,
      }
      data.candles.push(candle)
    }
    candle.timestamp = timestamp
    candle.last = price
    candle.low = Math.min(candle.low, price)
    candle.high = Math.max(candle.high, price)
    candle.buyVolume += t.side=='Buy' ? size : 0
    candle.sellVolume += t.side=='Sell' ? size : 0

    data[t.side=='Buy' ? 'buyVelocity' : 'sellVelocity'] += size
  })
  bitmexWs._data[tableName][symbol] = []
  display()
})
setInterval(() => {
  data.buyVelocity *= velocityRelaxation
  data.sellVelocity *= velocityRelaxation
  display()
}, 500)

const fetchTicksize = () => {
  return bitmex.request('GET', '/instrument', { symbol:symbol, columns:'tickSize' })
    .then(i => tickSize = parseFloat(i[0].tickSize) || tickSize).then(() => log(`${symbol} tick size ${tickSize}`)).catch(error('fetchOrders'))
}
fetchTicksize()
