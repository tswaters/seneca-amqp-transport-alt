const assert = require('assert')
const sinon = require('sinon')
const Seneca = require('seneca')
const SenecaPromise = require('seneca-promise')
const Transport = require('../../seneca-amqp-transport')

const opts = { log: 'silent' }

const wait = t => new Promise(resolve => setTimeout(resolve, t))

const createClient = pins =>
  new Promise(resolve => {
    const client = Seneca(opts)
    client.use(SenecaPromise)
    client.use(Transport)
    client.client({
      type: 'amqp',
      model: 'observe',
      pins
    })
    client.ready(() => resolve(client))
  })

const createListener = pins =>
  new Promise(resolve => {
    const listener = Seneca(opts)
    listener.use(SenecaPromise)
    listener.use(Transport)
    listener.listen({
      type: 'amqp',
      model: 'observe',
      pins
    })
    listener.ready(() => resolve(listener))
  })

describe('observe', () => {
  let listener1 = null
  let listener2 = null
  let listener3 = null
  let listener4 = null
  let client = null
  beforeEach(
    async () =>
      ([
        listener1,
        listener2,
        listener3,
        listener4,
        client
      ] = await Promise.all([
        createListener('role:test,cmd:*'),
        createListener('role:test,cmd:*'),
        createListener('role:test2,cmd:*'),
        createListener('role:test2,cmd:*'),
        createClient(['role:test,cmd:*', 'role:test2,cmd:*'])
      ]))
  )

  afterEach(async () =>
    Promise.all([
      new Promise(resolve => listener1.close(resolve)),
      new Promise(resolve => listener2.close(resolve)),
      new Promise(resolve => listener3.close(resolve)),
      new Promise(resolve => listener4.close(resolve)),
      new Promise(resolve => client.close(resolve))
    ])
  )

  it('should work properly', async () => {
    const listen1Stub = sinon.stub().resolves()
    const listen2Stub = sinon.stub().resolves()

    listener1.addAsync('role:test,cmd:observe', listen1Stub)
    listener2.addAsync('role:test,cmd:observe', listen1Stub)

    listener3.addAsync('role:test2,cmd:observe', listen2Stub)
    listener4.addAsync('role:test2,cmd:observe', listen2Stub)

    await client.actAsync('role:test,cmd:observe')
    await client.actAsync('role:test2,cmd:observe')

    // there's a timing issue here
    // we'll get back confirmation that amqp has received the fanout request
    // the actors above will be called soon thereafter
    // as such, the await on act is insufficient to determine if things got called
    // wait for 50ms - also note this is a flaky test; if amqp takes > 50ms it will fail.
    await wait(50)

    assert.equal(listen1Stub.callCount, 2)
    assert.equal(listen2Stub.callCount, 2)
  })
})
