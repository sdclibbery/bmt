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
* Store only the data we actually need for wallet: total, available, pnl
* Open a position - implement buy()/sell() functions
 x Calculate correct qty, price etc
 * Track order and check for fill
 * Track spread to get best limit entry
* Close an open position - implement close() function
 * Track spread to get best limit exit
* Set stop loss when open position, consider trailing stop... also check exec instructions
