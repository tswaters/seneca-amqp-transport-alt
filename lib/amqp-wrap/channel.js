const { Reconnector } = require('./reconnector')

exports.Channel = class Channel extends Reconnector {
  constructor(connection, setup, opts) {
    super(opts)
    this.client = connection.client
    this.channel = null
    this.setup = setup
    this.start()
  }

  async connect() {
    this.channel = await this.client.createConfirmChannel()
    await this.setup(this.channel)
    return this.channel
  }
}
