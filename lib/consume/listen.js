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
    const queueNames = tu
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
      Promise.all(queueNames.map(queueName => setupChannel(queueName)))
        .then(channels => {
          connection.channels = channels
          return null
        })
        .catch(err => err)
        .then(err => {
          if (initialized === false) {
            initialized = true
            fin(err)
          }
        })
    })
  }

const setupChannelFactory = (si, tu, opts, connection) => async queueName => {
  const channel = new Channel(
    connection,
    async channel => {
      const name = `listen-${opts.type}-${opts.model}-${queueName}`
      const parse = tu.parseJSON.bind(si, si, name)
      const stringify = tu.stringifyJSON.bind(si, si, name)
      await channel.assertQueue(queueName, { autoDelete: true })
      await channel.prefetch(opts.prefetch)
      await channel.consume(queueName, msg => {
        const {
          content,
          properties: { replyTo, correlationId }
        } = msg
        tu.handle_request(si, parse(content.toString()), opts, out => {
          const content = Buffer.from(stringify(out))
          channel.sendToQueue(replyTo, content, { correlationId })
          channel.ack(msg)
        })
      })
    },
    opts
  )

  channel.on('close', () => si.log.warn(`amqp channel [${queueName}] closed`))

  return new Promise((resolve, reject) => {
    channel.on('error', err => {
      si.log.error(`amqp channel [${queueName}] error`, si.util.clean(err))
      reject(err)
    })
    channel.on('ready', () => {
      si.log.info(`amqp channel [${queueName}] established`)
      resolve(channel)
    })
  })
}
