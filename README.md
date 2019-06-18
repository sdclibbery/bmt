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
* Errors go to the main console
* Open a position - implement buy()/sell() functions
 x Calculate correct qty, price etc
 * Place order
  ! Need to round qty
 * Track spread to get best limit entry
* Close an open position - implement close() function
 * Track spread to get best limit exit
* Set stop loss when open position, consider trailing stop... also check exec instructions
