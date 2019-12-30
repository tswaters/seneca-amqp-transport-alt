const proxyquire = require('proxyquire')
const sinon = require('sinon')
const { Channel } = require('../lib/amqp-wrap/channel')
const { Connection } = require('../lib/amqp-wrap/connection')

exports.Channel = () => sinon.createStubInstance(Channel)
exports.Connection = () => sinon.createStubInstance(Connection)

exports.Plugin = (si, { model, hook, connection, channel }) => {
  const _Connection = sinon.stub().returns(connection)
  const _Channel = sinon.stub().returns(channel)
  const Transport = proxyquire(`../lib/${model}/${hook}`, {
    '../amqp-wrap/connection': { Connection: _Connection },
    '../amqp-wrap/channel': { Channel: _Channel }
  })
  return function SenecaAmqpTransport(options) {
    const tu = si.export('transport/utils')
    si.add({ role: 'transport', hook, type: 'amqp' }, Transport(options, tu))
    return { name: 'stub-transport' }
  }
}
