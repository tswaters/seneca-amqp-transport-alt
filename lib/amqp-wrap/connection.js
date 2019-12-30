const amqplib = require('amqplib')
const { Reconnector } = require('./reconnector')

class Connection extends Reconnector {
  constructor(connectOpts, opts) {
    super(opts)
    this.channels = []
    this.connectOpts = connectOpts
    this.on('close', () => {
      let channel = null
      while ((channel = this.channels.pop())) channel.close(() => {})
    })
    this.start()
  }

  async connect() {
    this.client = await amqplib.connect(this.connectOpts)
    return this.client
  }
}

exports.Connection = Connection
