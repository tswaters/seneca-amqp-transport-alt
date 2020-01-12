'use strict'

const { Connection } = require('../amqp-wrap/connection')
const { Channel } = require('../amqp-wrap/channel')

module.exports = (options, tu) =>
  function(msg, fin) {
    const si = this.root.delegate()
    const opts = si.util.deepextend(options[msg.type], msg)
    const { die = false } = opts

    const connection = new Connection(opts)
    const setupChannel = setupChannelFactory(si, tu, opts, connection)
    const exchanges = tu
      .resolve_pins(opts)
      .map(pin => tu.resolve_topic(opts, { pin }, pin))

    let initialized = false

    connection.on('error', err => {
      if (!initialized) fin(err)
      if (initialized && die) si.die(err)
      si.log.error('amqp connection error', si.util.clean(err))
    })

    connection.on('close', () => si.log.warn('amqp connection closed'))
    connection.once('ready', () => tu.close(si, done => connection.close(done)))
    connection.on('ready', () => {
      si.log.info('amqp connection established')
      setupChannel(exchanges)
        .then(channel => (connection.channels = [channel]))
        .catch(err => err)
        .then(err => {
          if (initialized === false) {
            initialized = true
            fin(err)
          }
        })
    })
  }

const setupChannelFactory = (si, tu, opts, connection) => async exchanges => {
  const channel = new Channel(
    connection,
    async _channel => {
      await Promise.all(
        exchanges.map(async exchange => {
          const name = `listen-${opts.type}-${opts.model}-${exchange}`
          const parse = tu.parseJSON.bind(si, si, name)
          await _channel.assertExchange(exchange, 'fanout', {
            durable: false,
            autoDelete: true
          })
          const { queue } = await _channel.assertQueue('', {
            exclusive: true
          })
          await _channel.bindQueue(queue, exchange)
          _channel.consume(queue, msg => {
            const { content } = msg
            tu.handle_request(si, parse(content.toString()), opts, () =>
              _channel.ack(msg)
            )
          })
        })
      )
    },
    opts
  )

  channel.on('close', () => si.log.warn(`amqp channel closed`))

  return new Promise((resolve, reject) => {
    channel.on('error', err => {
      si.log.error(`amqp channel error`, si.util.clean(err))
      reject(err)
    })
    channel.on('ready', () => {
      si.log.info(`amqp channel established`)
      resolve(channel)
    })
  })
}
