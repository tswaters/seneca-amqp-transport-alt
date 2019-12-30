'use strict'

const EventEmitter = require('events')
const jsonic = require('jsonic')

const { Connection } = require('../amqp-wrap/connection')
const { Channel } = require('../amqp-wrap/channel')

module.exports = (options, tu) =>
  function(msg, fin) {
    const si = this.root.delegate()
    const opts = si.util.deepextend(options[msg.type], msg)
    const emitter = new EventEmitter()

    let performRequest = null
    let initialized = false

    // decorate errors with context from the request
    const createError = (error, data) => {
      const res = tu.prepareResponse(si, data)
      res.error = error
      return res
    }

    const connection = new Connection(opts.url, opts)
    connection.on('close', () => si.log.warn('amqp connection closed'))
    connection.on('error', err => {
      if (!initialized) fin(err)
      si.log.error('amqp connection error', si.util.clean(err))
    })
    connection.once('ready', () => tu.close(si, done => connection.close(done)))
    connection.on('ready', () => {
      si.log.info('amqp connection established')
      setupChannel(connection)
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

    function clientFactory(spec, topic, clientDone) {
      clientDone(null, (msg, done, meta) => {
        const pin = jsonic(meta.pattern)
        const data = tu.prepare_request(si, msg, done, meta)
        const queueName = tu.resolve_topic(opts, { pin }, pin)
        const name = `client-${opts.type}-${opts.model}-${queueName}`
        const parse = tu.parseJSON.bind(si, si, name)
        const stringify = tu.stringifyJSON.bind(si, si, name)
        const correlationId = meta.id

        if (performRequest == null) {
          // this shouldn't happen if services wait for ready before firing actions.
          // if we lose connection while running, it might crop up.
          // future: provide an option to keep queue of things & send once re-established
          // for now: just return an error to the caller
          return tu.handle_response(
            si,
            createError(new Error('no client'), data),
            opts
          )
        }

        performRequest(queueName, correlationId, stringify(data))
        emitter.once(correlationId, (error, res) => {
          if (error) res = createError(error, data)
          else res = parse(res)
          tu.handle_response(si, res, opts)
        })
      })
    }

    async function setupChannel(connection) {
      si.log.info('amqp connection established')
      const channel = new Channel(
        connection,
        async channel => {
          const { queue: replyTo } = await channel.assertQueue('', {
            exclusive: true
          })

          // unroutable - calling `si.act('pin-with-no-listener')`
          channel.on('return', msg => {
            const {
              properties: { correlationId, replyTo: returnReplyTo }
            } = msg

            if (replyTo !== returnReplyTo) return
            emitter.emit(correlationId, new Error('unrouted'))
          })

          channel.consume(replyTo, msg => {
            if (msg == null) return
            const {
              content,
              properties: { correlationId }
            } = msg
            emitter.emit(correlationId, null, content.toString())
            channel.ack(msg)
          })

          performRequest = (queueName, correlationId, str) => {
            channel.sendToQueue(queueName, Buffer.from(str), {
              correlationId,
              replyTo,
              mandatory: true
            })
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
          si.log.error('amqp channel error', si.util.clean(err))
          reject(err)
        })
        channel.on('ready', () => {
          si.log.info('amqp channel established')
          resolve(channel)
        })
      })
    }
  }
