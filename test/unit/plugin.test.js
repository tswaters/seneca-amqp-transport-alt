'use strict'

const assert = require('assert')
const proxyquire = require('proxyquire')
const sinon = require('sinon')
const Seneca = require('seneca')
const { Channel } = require('../../lib/amqp-wrap/channel')
const { Connection } = require('../../lib/amqp-wrap/connection')

// I have a feeling having these tests are going to be a pain in the future
// They are intended to simulate failure cases that are difficult to automate
// such as turning off the AMQP broker after connecting, verifying it retries
// and eventually succeeds once the broker is turned back on.
//
// A few notes on the timeouts:
//
// we can't use emitters during initialization;
// Seneca fires the plugin initialization logic in next tick.
// Plugin initialization waits for events to fire
// if we emit via a stub too early, the handlers haven't been attached yet.
// if we await on seneca.ready, it times out waiting for the events
// so, we get around it with a timeout (takes way longer on node8, 150ms to be safe.)

const wait = ts => new Promise(resolve => setTimeout(resolve, ts))

const specs = [
  { model: 'observe', hook: 'listen' },
  { model: 'observe', hook: 'client' },
  { model: 'consume', hook: 'listen' },
  { model: 'consume', hook: 'client' }
]

const opts = {
  log: 'silent'
}

describe('plugin', () => {
  let si = null
  let connection = null
  let channel = null
  let Transport = null
  let fatalError = null

  beforeEach(async () => {
    connection = sinon.createStubInstance(Connection)
    channel = sinon.createStubInstance(Channel)
    connection.emit.callThrough()
    channel.emit.callThrough()
    connection.on.callThrough()
    channel.on.callThrough()
    si = Seneca({
      ...opts,
      errhandler: err => {
        fatalError = err
        return false
      },
      debug: { undead: true }
    })
    Transport = proxyquire(
      '../../seneca-amqp-transport',
      Object.entries(specs).reduce(
        (memo, [, { model, hook }]) => ({
          ...memo,
          [`./lib/${model}/${hook}`]: proxyquire(`../../lib/${model}/${hook}`, {
            '../amqp-wrap/connection': {
              Connection: sinon.stub().returns(connection)
            },
            '../amqp-wrap/channel': {
              Channel: sinon.stub().returns(channel)
            }
          })
        }),
        {}
      )
    )
  })

  afterEach(done => {
    fatalError = null
    sinon.reset()
    si.close(done)
  })

  it('throws for invalid model', async () => {
    si.use(Transport)
    si.listen({ type: 'amqp', model: 'invalid', pin: 'role:test,cmd:echo' })
    await wait(16)
    await new Promise(resolve => si.ready(resolve))
    assert(fatalError)
    assert(/invalid model/.test(fatalError.message))
  })

  describe('connection errors during initialization', () =>
    specs.forEach(({ model, hook }) => {
      it(`${model}-${hook}`, async () => {
        si.use(Transport)
        si[hook]({ type: 'amqp', model, pin: 'role:test,cmd:echo' })
        await wait(150)
        connection.emit('error', new Error('aw snap'))
        await new Promise(resolve => si.ready(resolve))
        assert(fatalError)
        assert(/aw snap/.test(fatalError.message))
      })
    }))

  describe('channel errors during initialization', () =>
    specs.forEach(({ model, hook }) => {
      it(`${model}-${hook}`, async () => {
        si.use(Transport)
        si[hook]({ type: 'amqp', model, pin: 'role:test,cmd:echo' })
        await wait(150)
        connection.emit('ready')
        channel.emit('error', new Error('aw snap'))
        await new Promise(resolve => si.ready(resolve))
        assert(fatalError)
        assert(/aw snap/.test(fatalError.message))
      })
    }))

  describe('connection problems after initialization', () =>
    specs.forEach(({ model, hook }) => {
      it(`${model}-${hook}`, async () => {
        si.use(Transport)
        si[hook]({ type: 'amqp', model, pin: 'role:test,cmd:echo' })
        await wait(150)
        connection.emit('ready')
        channel.emit('ready')
        await new Promise(resolve => si.ready(resolve))

        channel.emit('error')
        connection.emit('error')
        channel.emit('close')
        connection.emit('close')
        //  a few moments later
        connection.emit('ready')
        channel.emit('ready')
        await wait(150)
      })
    }))

  describe('connection failures kill when die is enabled', () =>
    specs.forEach(({ model, hook }) => {
      it(`${model}-${hook}`, async () => {
        si.use(Transport, { die: true })
        si[hook]({ type: 'amqp', model, pin: 'role:test,cmd:echo' })
        await wait(150)
        connection.emit('ready')
        channel.emit('ready')
        await new Promise(resolve => si.ready(resolve))

        channel.emit('error', new Error('aw snap'))
        connection.emit('error', new Error('aw snap'))
        channel.emit('close')
        connection.emit('close')
        await wait(150)

        assert(fatalError)
        assert.equal(fatalError.message, 'aw snap')
      })
    }))
})
