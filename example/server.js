const Seneca = require('seneca')
const Transport = require('..')

const seneca = Seneca({
  system: {
    close_signals: {
      SIGHUP: true,
      SIGTERM: true,
      SIGINT: true,
      SIGBREAK: true
    }
  }
})

seneca.use(Transport)

seneca.listen({ type: 'amqp', pins: ['role:second,cmd:*', 'role:test,cmd:*'] })

seneca.add({ role: 'test', cmd: 'echo' }, (msg, done) => done(null, msg))

seneca.add({ role: 'test', cmd: 'err' }, ({ msg }, done) => done(Error(msg)))

seneca.add({ role: 'second', cmd: 'echo' }, (msg, done) => done(null, msg))

seneca.add({ role: 'second', cmd: 'err' }, ({ msg }, done) => done(Error(msg)))
