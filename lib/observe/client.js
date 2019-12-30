'use strict'

const jsonic = require('jsonic')
const { Connection } = require('../amqp-wrap/connection')
const { Channel } = require('../amqp-wrap/channel')

module.exports = (options, tu) =>
  function(msg, fin) {
    const si = this.root.delegate()
    const opts = si.util.deepextend(options[msg.type], msg)
    let initialized = false
    let performRequest = null

    // create a response that seneca can make sense out of
    const createResponse = (error, data) => {
      const res = tu.prepareResponse(si, data)
      if (error) res.error = error
      else res.res = { ok: true }
      return res
    }

    const exchanges = tu
      .resolve_pins(opts)
      .map(pin => tu.resolve_topic(opts, { pin }, pin))

    const connection = new Connection(opts.url, opts)
    connection.on('error', err => {
      if (!initialized) fin(err)
      si.log.error('amqp connection error', err)
    })
    connection.once('ready', () => tu.close(si, done => connection.close(done)))
    connection.on('ready', () => {
      si.log.info('amqp connection established')
      setupChannel()
        .then(channel => {
          connection.channels = [channel]
          return null
        })
        .catch(err => err)
        .then(err => {
          if (initialized === false) {
            if (err) return fin(err)
            initialized = true
            tu.make_client(si, clientFactory, opts, fin)
          }
        })
    })

    async function clientFactory(spec, topic, clientDone) {
      clientDone(null, (msg, done, meta) => {
        const pin = jsonic(meta.pattern)
        const data = tu.prepare_request(si, msg, done, meta)
        const exchange = tu.resolve_topic(opts, { pin }, pin)
        const name = `client-${opts.type}-${opts.model}-${exchange}`
        const stringify = tu.stringifyJSON.bind(si, si, name)
        const content = Buffer.from(stringify(data))

        if (performRequest == null) {
          // this shouldn't happen if services wait for ready before firing actions.
          // if we lose connection while running, it might crop up.
          // future: provide an option to keep queue of things & send once re-established
          // for now: just return an error to the caller
          return tu.handle_response(
            si,
            createResponse(new Error('no client'), data),
            opts
          )
        }

        performRequest(exchange, content, error => {
          tu.handle_response(si, createResponse(error, data), opts)
        })
      })
    }

    async function setupChannel() {
      si.log.info('amqp connection established')

      const channel = new Channel(
        connection,
        async _channel => {
          await Promise.all(
            exchanges.map(exchange =>
              _channel.assertExchange(exchange, 'fanout', {
                durable: false,
                autoDelete: true
              })
            )
          )
          performRequest = (exchange, content, done) => {
            _channel.publish(exchange, '', content)
            _channel
              .waitForConfirms()
              .then(() => done())
              .catch(err => done(err))
          }
        },
        opts
      )

      channel.on('close', () => {
        si.log.warn('amqp channel closed')
        performRequest = null
      })

      return new Promise((resolve, reject) => {
        channel.on('error', err => {
          reject(err)
          si.log.error('amqp channel error', err)
        })
        channel.on('ready', () => {
          resolve(channel)
          si.log.info('amqp channel established')
        })
      })
    }
  }
