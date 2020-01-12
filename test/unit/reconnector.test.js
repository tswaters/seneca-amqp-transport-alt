'use strict'

const assert = require('assert')
const EventEmitter = require('events')
const sinon = require('sinon')

const { Reconnector } = require('../../lib/amqp-wrap/reconnector')

describe('reconnector', () => {
  let clock = null
  let reconnector = null
  let errorCount = 0
  let readyCount = 0
  let closeCount = 0

  beforeEach(() => {
    clock = sinon.useFakeTimers({ toFake: ['setInterval'] })
    reconnector = new Reconnector()
    reconnector.on('ready', () => readyCount++)
    reconnector.on('error', () => errorCount++)
    reconnector.on('close', () => closeCount++)
  })

  afterEach(() => {
    clock.restore()
    sinon.reset()
    errorCount = 0
    readyCount = 0
    closeCount = 0
  })

  it('connection errors should be emitted', async () => {
    reconnector.connect = () => Promise.reject(new Error('aw snap'))
    reconnector.on('error', err => assert.ok(/aw snap/.test(err.message)))
    reconnector.on('ready', () => assert.fail('should not be here'))
    await reconnector.start()
  })

  it('should reconnect properly', async () => {
    let emitter = null

    reconnector.connect = async () => (emitter = new EventEmitter())
    await reconnector.start()

    assert.equal(readyCount, 1)
    assert.equal(reconnector.tid, null)

    emitter.emit('error')
    emitter.emit('close')
    assert.equal(errorCount, 1)
    assert.equal(closeCount, 1)
    assert.ok(reconnector.tid)
    clock.tick(5000)
    await Promise.resolve()

    assert.equal(readyCount, 2)
  })

  it('shouldnt reconnect if die is set to true', () => {
    reconnector.die = true
    reconnector.emit('close')
    assert.equal(reconnector.tid, null)
  })
})
