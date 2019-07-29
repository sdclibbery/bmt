const commandLineArgs = require('command-line-args')

exports.parse = (logger, optionDefinitions) => {
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
  return options
}
