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
* Use 'Close' exec instruction for closing
* Set stop loss when opening position, consider trailing stop... also check exec instructions
* Sort out proper order updating that actually works
* Indicate buy/sell fraction in recent trades, maybe also indicate volume velocity?
* Candle graphs
* Can half close open position
