const amqplib = require('amqplib')
const { Reconnector } = require('./reconnector')

exports.Connection = class Connection extends Reconnector {
  constructor(opts) {
    super(opts)

    this.args = []
    if (opts.url) this.args.push(opts.url)
    else this.args.push(opts)
    if (opts.socketOptions) this.args.push(opts.socketOptions)

    this.channels = []
    this.on('close', () => {
      let channel = null
      while ((channel = this.channels.pop())) channel.close(() => {})
    })
    this.start()
  }

  async connect() {
    this.client = await amqplib.connect(...this.args)
    return this.client
  }
}
