# bmt

## ToDo
x Show current price/spread/order history
x Show wallet/position/order info
x Colours
x units: convert from satoshis or whatever they are
x Just make an order
x Terminal setup
 x Full screen
 x Errors still go to console
 x Respond immediately to keypresses
x Errors go to the main console
x Open a position - implement buy()/sell() functions
 x Calculate correct qty, price etc
 x Place order
  x Need to round qty
x sell() function
x Close an open position - implement close() function
x TEST buy AND sell and close each
x set leverage not working??
x Can cancel open order
x Track open orders against spread
x Show status message in grey
x Switch to websocket data feed
x Show mark price alongside recent trade, not as part of position
x Set leverage at startup, not when placing order (to improve order placement latency)
x Can get spread and mark from insturment ws?
x Use 'Close' exec instruction for closing
x Set stop loss when opening position
x Sort out proper order updating that actually works
x Indicate spread vs. mark price
x Make orders invisible?
x Go back to using order book for spread
x Indicate ACTUAL pnl side for each position, using mid-spread not mark price
x Use HSL for indicator colour
x Logging to file
x Limit stops no use: switch to market
x Fix order fetch
x Can marketify order
x Tweak stoploss px
* Can move stoploss up/down
* Retry 'system overloaded' errors
* Support selecting different SYmbol as cmd line param
* Look at tracking buy/sell 'push' indicators
* Can set 'take profit'
* Can make stop loss trailing
* Indication of volume velocity
 * Use trade ws feed
 * Need to estimate velocity from that discrete input
  * Calculate average recent velocity on each trade as volume / time since last trade
   * Then mix that into a rolling average velocity, weighted based on time since last update
 * Also track velocity for each side alone as well?
* Candle graphs
* Can set 'take profit' order and adjust its price
* Can half close open position
