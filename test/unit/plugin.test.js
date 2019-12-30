'use strict'

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
// A few notes on the timeouts and lack of assertions:
//
// Seneca doesn't return plugin errors during init
// as such, we can't verify these error tests (they show up in coverage though)
// this is also why we have `undead: true` in the debug options -
// otherwise seneca will recognize an initialization failure and process.exit(1).
//
// furthermore, we can't use emitters during initialization;
// Seneca fires the plugin initialization logic in next tick.
// Plugin initialization waits for events to fire
// if we emit via a stub too early, the handlers haven't been attached yet.
// if we await on seneca.ready, it times out waiting for the events
// so, we get around it with a 16ms timeout.

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

  beforeEach(async () => {
    connection = sinon.createStubInstance(Connection)
    channel = sinon.createStubInstance(Channel)
    connection.emit.callThrough()
    channel.emit.callThrough()
    connection.on.callThrough()
    channel.on.callThrough()
    si = Seneca({ ...opts, debug: { undead: true } })
    si.use(
      proxyquire(
        '../../seneca-amqp-transport',
        Object.entries(specs).reduce(
          (memo, [, { model, hook }]) => ({
            ...memo,
            [`./lib/${model}/${hook}`]: proxyquire(
              `../../lib/${model}/${hook}`,
              {
                '../amqp-wrap/connection': {
                  Connection: sinon.stub().returns(connection)
                },
                '../amqp-wrap/channel': {
                  Channel: sinon.stub().returns(channel)
                }
              }
            )
          }),
          {}
        )
      )
    )
  })

  afterEach(done => {
    sinon.reset()
    si.close(done)
  })

  it('throws for invalid model', async () => {
    si.listen({ type: 'amqp', model: 'invalid', pin: 'role:test,cmd:echo' })
    await wait(16)
    await new Promise(resolve => si.ready(resolve)) // can't assert, seneca doesn't give back plugin errors
  })

  describe('connection errors during initialization', () =>
    specs.forEach(({ model, hook }) => {
      it(`${model}-${hook}`, async () => {
        si[hook]({ type: 'amqp', model, pin: 'role:test,cmd:echo' })
        await wait(150)
        connection.emit('error', new Error('aw snap'))
        await new Promise(resolve => si.ready(resolve)) // can't assert, seneca doesn't give back plugin errors
      })
    }))

  describe('channel errors during initialization', () =>
    specs.forEach(({ model, hook }) => {
      it(`${model}-${hook}`, async () => {
        si[hook]({ type: 'amqp', model, pin: 'role:test,cmd:echo' })
        await wait(150)
        connection.emit('ready')
        channel.emit('error', new Error('aw snap'))
        await new Promise(resolve => si.ready(resolve)) // can't assert, seneca doesn't give back plugin errors
      })
    }))

  describe('connection problems after initialization', () =>
    specs.forEach(({ model, hook }) => {
      it(`${model}-${hook}`, async () => {
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
})
