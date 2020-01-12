'use strict'

const defaults = require('./defaults')
const { version } = require('./package.json')

const transports = {
  consume: {
    client: require('./lib/consume/client'),
    listen: require('./lib/consume/listen')
  },
  observe: {
    client: require('./lib/observe/client'),
    listen: require('./lib/observe/listen')
  }
}

const modelTypes = Object.keys(transports)

module.exports = function SenecaAmqpTransport(options) {
  const name = 'SenecaAmqpTransport'
  const seneca = this

  const tu = seneca.export('transport/utils')
  const opts = seneca.util.deepextend(defaults, { amqp: options })

  const get = hook => (msg, fin) => {
    const { model = 'consume' } = msg
    if (!modelTypes.includes(model))
      throw new Error(
        `invalid model, expecting one of ${modelTypes} got ${model}`
      )
    return transports[model][hook](opts, tu).call(seneca, msg, fin)
  }

  seneca.add(
    { role: 'transport', hook: 'listen', type: 'amqp' },
    get('listen', opts, tu)
  )
  seneca.add(
    { role: 'transport', hook: 'client', type: 'amqp' },
    get('client', opts, tu)
  )

  return {
    name,
    tag: version
  }
}
