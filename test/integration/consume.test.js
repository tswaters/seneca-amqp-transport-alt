const assert = require('assert')
const Seneca = require('seneca')
const SenecaPromise = require('seneca-promise')
const Transport = require('../../seneca-amqp-transport')

const opts = { log: 'silent' }
const wait = t => new Promise(resolve => setTimeout(resolve, t))

describe('consume', () => {
  let client = null
  let client2 = null
  let listener = null
  beforeEach(async () =>
    Promise.all([
      new Promise((resolve, reject) => {
        client = Seneca({ ...opts, tag: 'client1' })
        client.use(SenecaPromise)
        client.use(Transport)
        client.client({ type: 'amqp', pin: 'role:test,cmd:*' })
        client.ready(err => (err ? reject(err) : resolve()))
      }),
      new Promise((resolve, reject) => {
        client2 = Seneca({ ...opts, tag: 'client2' })
        client2.use(SenecaPromise)
        client2.use(Transport)
        client2.client({ type: 'amqp', pin: 'role:other,cmd:*' })
        client2.ready(err => (err ? reject(err) : resolve()))
      }),
      new Promise((resolve, reject) => {
        listener = Seneca({ ...opts, tag: 'listener' })
        listener.use(SenecaPromise)
        listener.use(Transport)
        listener.listen({
          type: 'amqp',
          timeout: 100,
          pins: ['role:test,cmd:*', 'role:other,cmd:*']
        })
        listener.ready(err => {
          if (err) return reject(err)
          listener.addAsync({ role: 'other', cmd: 'echo' }, async msg => msg)
          listener.addAsync({ role: 'test', cmd: 'echo' }, async msg => msg)

          listener.addAsync({ role: 'test', cmd: 'error' }, async () =>
            Promise.reject(new Error('aw snap'))
          )

          listener.addAsync({ role: 'test', cmd: 'wait' }, async ({ time }) => {
            await wait(time)
            return { ok: true }
          })
          listener.ready(err => (err ? reject(err) : resolve()))
          listener.ready(resolve)
        })
      })
    ])
  )

  afterEach(async () =>
    Promise.all([
      new Promise(resolve => client.close(resolve)),
      new Promise(resolve => client2.close(resolve)),
      new Promise(resolve => listener.close(resolve))
    ])
  )

  it('should work properly', async () => {
    const res = await client.actAsync('role:test,cmd:echo', { ok: true })
    assert(res)
    assert(res.ok, true)

    const res2 = await client2.actAsync('role:other,cmd:echo', { ok: true })
    assert(res2)
    assert(res2.ok, true)

    await assert.rejects(
      () => client.actAsync('role:test,cmd:error', { ok: true }),
      /aw snap/g
    )
  })

  it('handles unrouted properly', async () => {
    // messy, just makes sure we test return case if listener is defined but not present
    // this returns a timeout if we don't handle it explicitly.
    await new Promise(resolve => listener.close(resolve))
    await assert.rejects(
      () => client.actAsync('role:test,cmd:echo', { ok: true }),
      /unrouted/g
    )
  })
})
