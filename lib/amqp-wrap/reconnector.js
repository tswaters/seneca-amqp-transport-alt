const EventEmitter = require('events')

exports.Reconnector = class Reconnector extends EventEmitter {
  constructor({ reconnectInterval = 5000, die = false } = {}) {
    super()

    this.closing = false
    this.tid = null
    this.emitter = null
    this.die = die
    this.reconnectInterval = reconnectInterval

    this.on('connected', emitter => {
      clearInterval(this.tid)
      emitter.on('error', err => this.emit('error', err))
      emitter.on('close', () => this.emit('close'))
      this.emitter = emitter
      this.emit('ready')
    })

    this.on('close', () => {
      if (this.closing) return clearInterval(this.tid)
      if (this.die) return // don't attempt reconnect if die is set.
      this.tid = setInterval(() => this.start(), this.reconnectInterval)
    })
  }

  start() {
    return this.connect()
      .then(emitter => this.emit('connected', emitter))
      .catch(err => this.emit('error', err))
  }

  close(done) {
    clearInterval(this.tid)
    this.closing = true
    this.emitter
      .close()
      .then(() => done())
      .catch(err => done(err))
  }
}
