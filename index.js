const BitmexRequest = require('bitmex-request').BitmexRequest
const BitMEXClient = require('bitmex-realtime-api')
const credentials = require('./bitmex_credentials')
const commandLineArgs = require('command-line-args')
const term = require( 'terminal-kit' ).terminal
const hsl = require('hsl-to-hex')
const logger = require('./logger').createLogger(`bmt.log`)

// Command line Options

const optionDefinitions = [
  { name: 'symbol', alias: 's', type: String, defaultValue: 'XBTUSD', description: 'BitMex market symbol eg XBTUSD, ETHUSD, LTCU19' },
  { name: 'help', alias: 'h', type: Boolean, defaultValue: false, description: 'Show this help' },
]
let options
try {
  options = commandLineArgs(optionDefinitions)
} catch (e) {
  logger.sync.error(`Options error: ${e.toString()}\nOptionDefs: ${JSON.stringify(optionDefinitions)}\nCmd Line: ${process.argv}\n`)
}
const missingButRequiredOptions = optionDefinitions
        .filter((o) => o.defaultValue == undefined)
        .filter((o) => options[o.name] == undefined)
if (options.help || missingButRequiredOptions.length > 0) {
  const usageForOption = (o) => {
    const showRequirements = o.type != Boolean
    const requirements = o.defaultValue != undefined ? 'Defaults to ' + o.defaultValue : 'Required'
    return `--${o.name} -${o.alias} : ${o.description}${showRequirements ? '. '+requirements : ''}`
  }
  let usage = optionDefinitions.reduce((u,o) => `${u}\n${usageForOption(o)}.`, '')
  const msg = `${new Date()} BitMex helper.\nCalled with: ${JSON.stringify(options)}\nUsage: ${usage}`
  logger.sync.info(msg)
  process.exit()
}

// constants

const symbol = options.symbol
const leverage = 25
const openWalletFraction = 0.505
const stopPxFraction = 0.9925
let tickSize = {"XBTUSD":0.5, "ETHUSD":0.05, "LTCU19":0.000005}[symbol] || 1
const candleSize = 30*1000
const volumeScale = 2e-6

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
  wallet: [],
  spread: undefined,
  openOrders: [],
  openPositions: undefined,
  status: 'Init',
}
const roundToTickSize = (x) => Number.parseFloat(x).toFixed(Math.floor(-Math.log10(tickSize)))
const status = (s) => { log(s); data.status = s; display(); }
const walletTotal = () => (((data.wallet.filter(({transactType}) => transactType == 'Total')[0]) || {}).walletBalance)
const walletCurrency = () => ((data.wallet[0] || {}).currency)
const limitOrders = () => data.openOrders.filter(o => o.ordType=='Limit' && o.symbol == symbol)
const stopOrders = () => data.openOrders.filter(o => o.ordType=='Stop' && o.symbol == symbol)
const canBuySell = () => (data.wallet.length>0 && data.spread && data.openPositions && data.openPositions.length==0 && data.openOrders.length==0)
const canClose = () => (data.spread && data.openPositions && data.openPositions.length==1 && data.openPositions[0].symbol == symbol && limitOrders().length==0)
const canCancel = () => (data.openOrders && data.openOrders.length>0 && data.openOrders[0].symbol == symbol)
const canMoveStop = () => stopOrders().length > 0
const canMarketify = () => limitOrders().length > 0

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
const reallyDisplay = () => {
  term.side = (side,t) => side=='Sell'?term.brightRed(t):term.brightGreen(t)
  term.sign = (x) => x<0?term.brightRed(x):term.brightGreen(x)
  const begin = () => term.styleReset()

  term.clear().moveTo(1,1)

  if (credentials.testnet) {
    begin()('<TestNet>\n')
  }

  begin()('wallet')(' ').brightBlue(units(walletTotal()))(' ')(walletCurrency())
  term('\n')

  const t = data.lastTrade
  begin()('last ').side(t.side, t.price)(' ')('mark ').magenta(data.markPrice)(' ')(symbol)('\n')

  const s = data.spread
  const midSpreadPrice = s ? (s.hi+s.lo)/2 : 0
  begin()('spread ')
  if (s) {
    term.brightGreen(s.lo)(' - ').brightRed(s.hi)(' ')(symbol)('\n')
  }

  const candles = data.candles.slice(-(term.width-1))
  const scaleVol = v => 0.01 + v*volumeScale/(candleSize/1000)
  begin(); candles.forEach(c => term.colorRgb(0, Math.min(Math.floor(scaleVol(c.buyVolume)*255), 255), 0, '█')); term('\n')
  begin(); candles.forEach(c => term.colorRgb(Math.min(Math.floor(scaleVol(c.sellVolume)*255), 255), 0, 0, '█')); term('\n')

  begin()('\n')
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
  if (canBuySell()) { term.side('Buy', " 'B'uy").side('Sell', " 'S'ell") }
  if (canClose()) { term.wrap("  ^B'C'lose") }
  if (canCancel()) { term.wrap("  ^BCa'n'cel") }
  if (canMarketify()) { term.wrap("  ^M'M'arketify") }
  if (canMoveStop()) { term.wrap("  ^MStop'U'p Stop'D'own") }
}
display()
term.on('key', (name, matches, data) => {
  const is = (c) => name == c
	if (is('CTRL_C') || is('q')) { terminate() }
  if (canBuySell() && is('b')) { buy() }
  if (canBuySell() && is('s')) { sell() }
  if (canClose() && is('c')) { close() }
  if (canCancel() && is('n')) { cancel() }
  if (canMarketify() && is('m')) { marketify() }
  if (canMoveStop() && is('u')) { stopUp() }
  if (canMoveStop() && is('d')) { stopDown() }
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

const market = (qty) => {
  const side = qty>0 ? 'Buy' : 'Sell'
  status(`Market ${side} ${qty}`)
  return bitmex.request('POST', '/order', {
      ordType: 'Market', symbol: symbol, displayQty: 0,
      side: side, orderQty: qty
    }).catch(error('market'))
}

const closePosition = (price, baseId) => {
  const id = `${baseId} ${Date.now()}`
  status(`Closing at ${price}\n  '${id}'`)
  return bitmex.request('POST', '/order', {
      ordType: 'Limit', clOrdID: id, symbol: symbol,
      price: price, execInst: 'Close'
    }).catch(error('closePosition'))
}

const stopClose = (side, stopPx) => {
  stopPx = Math.round(stopPx)
  const id = `StopClose ${Date.now()}`
  status(`StopClose ${side} at ${stopPx}\n  '${id}'`)
  return bitmex.request('POST', '/order', {
      ordType: 'Stop', clOrdID: id, symbol: symbol,
      side: side, stopPx: stopPx, execInst: 'Close'
    }).catch(error('stopClose'))
}

const setOrderPrice = (clOrdID, newPrice) => {
  status(`Updating\n  '${clOrdID}' to ${newPrice}`)
  return bitmex.request('PUT', '/order', { origClOrdID: clOrdID, price: newPrice }).catch(handleOrderUpdateError('setOrderPrice'))
}

const setStopPx = (clOrdID, newStopPx) => {
  status(`Updating\n  '${clOrdID}' to ${newStopPx}`)
  return bitmex.request('PUT', '/order', { origClOrdID: clOrdID, stopPx: newStopPx }).catch(handleOrderUpdateError('setStopPx'))
}

const handleOrderUpdateError = (context) => e => {
  if (e.toString().includes('Invalid ordStatus')) {
    log(`${context}: Invalid ordStatus: removing order\n  ${clOrdID}`)
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

// Actions

const buy = () => {
  status(`Buying ${symbol}`)
  const price = data.spread.lo
  const qty = roundToTickSize(units(walletTotal())*leverage*price*openWalletFraction)
  limit(qty, price, 'UpdateMe')
    .then(() => stopClose('Sell', price*stopPxFraction))
    .then(fetchOrders)
}

const sell = () => {
  status(`Selling ${symbol}`)
  const price = data.spread.hi
  const qty = -roundToTickSize(units(walletTotal())*leverage*price*openWalletFraction)
  limit(qty, price, 'UpdateMe')
    .then(() => stopClose('Buy', price/stopPxFraction))
    .then(fetchOrders)
}

const marketify = () => {
  Promise.all(limitOrders().map(o => {
    status(`Converting to market ${o.clOrdID}`)
    cancelOrder(o.clOrdID)
    return market(o.orderQty)
  })).then(fetchOrders)
}

const stopUp = () => {
  Promise.all(stopOrders().map(o => {
    status(`Up stop ${o.clOrdID}`)
    const newStopPx = roundToTickSize(o.stopPx / Math.sqrt(Math.sqrt(stopPxFraction)))
    return setStopPx(o.clOrdID, newStopPx)
  })).then(fetchOrders)
}

const stopDown = () => {
  Promise.all(stopOrders().map(o => {
    status(`Down stop ${o.clOrdID}`)
    const newStopPx = roundToTickSize(o.stopPx * Math.sqrt(Math.sqrt(stopPxFraction)))
    return setStopPx(o.clOrdID, newStopPx)
  })).then(fetchOrders)
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
fetchOrders(); setInterval(fetchOrders, 5000)

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
  })
  bitmexWs._data[tableName][symbol] = []
  display()
})

const fetchTicksize = () => {
  return bitmex.request('GET', '/instrument', { symbol:symbol, columns:'tickSize' })
    .then(i => tickSize = parseFloat(i[0].tickSize) || tickSize).then(() => log(`${symbol} tick size ${tickSize}`)).catch(error('fetchOrders'))
}
fetchTicksize()
