const EventEmitter = require('events')

class Reconnector extends EventEmitter {
  constructor({ reconnectInterval = 5000 } = {}) {
    super()
    this.closing = false
    this.tid = null
    this.emitter = null

    this.on('connected', emitter => {
      clearInterval(this.tid)
      emitter.on('error', err => this.emit('error', err))
      emitter.on('close', () => this.emit('close'))
      this.emitter = emitter
      this.emit('ready')
    })

    this.on('close', () => {
      if (this.closing) return clearInterval(this.tid)
      this.tid = setInterval(() => this.start(), reconnectInterval)
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

exports.Reconnector = Reconnector
