var path = require('path'),
    util  = require('util'),
    fs   = require('fs');

var Logger = function (logFilePath, writer) {
  logFilePath = path.normalize(logFilePath)
  this.stream = fs.createWriteStream(logFilePath, {flags: 'a', encoding: 'utf8', mode: 0666})
  this.write = (text) => {
    console.log(text)
    writer(this.stream, text + "\n")
  }
}

Logger.prototype.format = (level, values) => {
  let content = ''
  values.forEach((v) => {
    if (typeof v === 'string') {
      content += ' ' + v
    } else {
      content += ' ' + util.inspect(v, false, null)
    }
  })
  return [level, ' [', new Date(), '] ', content].join('')
}

Logger.prototype.debug = function (...args) { this.write(this.format('debug', args)) }
Logger.prototype.info = function (...args) { this.write(this.format('info', args)) }
Logger.prototype.warn = function (...args) { this.write("\n" + this.format('warn', args) + "\n") }
Logger.prototype.error = function (...args) { this.write("\n" + this.format('error', args) + "\n") }

exports.Logger = Logger
exports.createLogger = (logFilePath) => {
  let logger = new Logger(logFilePath, (stream, text) => { stream.write(text) })
  logger.sync = new Logger(logFilePath, (stream, text) => { fs.writeFileSync(logFilePath, text, {flag: 'a'}) })
  return logger
}
