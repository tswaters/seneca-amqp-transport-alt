![Seneca](http://senecajs.org/files/assets/seneca-logo.png)

# seneca-amqp-transport-alt

<a href="https://www.npmjs.org/package/seneca-amqp-transport-alt"><img
  src="https://img.shields.io/npm/v/seneca-amqp-transport-alt" alt="npm version"></a>
<a href="https://travis-ci.org/tswaters/seneca-amqp-transport-alt/"><img
  src="https://img.shields.io/travis/tswaters/seneca-amqp-transport-alt" alt="build status"></a>
<a href='https://coveralls.io/github/tswaters/seneca-amqp-transport-alt?branch=master'><img
  src='https://coveralls.io/repos/github/tswaters/seneca-amqp-transport-alt/badge.svg?branch=master' alt='Coverage Status' /></a>
<a href="https://github.com/tswaters/seneca-amqp-transport-alt/blob/master/LICENSE"><img
  src="https://img.shields.io/npm/l/seneca-amqp-transport-alt" alt="license (MIT)"></a>

This is a re-implementation of the [official amqp transport for seneca](https://github.com/senecajs/seneca-amqp-transport). It supports a few different things:

- reconnecting / re-establishing connections upon failure
- model: observe via fanout exchanges
- return messages if no listeners defined

## install

```sh
npm i seneca-amqp-transport-alt
```

## usage

You can use this plugin by loading it into seneca via `use` The second parameter to use are configuration options. See options below.

Then adding `client`s and `listen`ers to the seneca instance. The default `model` is consume, but `observe` (via fanout) is also supported.

The `pin` or `pins` object must match identically between the respective `client` and `listen` calls.

### options / defaults

```js
const Transport = require('seneca-amqp-transport-alt')

const opts = {

  // will wait this long before reconnecting if connection is lost
  // will connect in a setInterval callback until connection re-established.
  // if not provided, will not reconnect.
  reconnectInterval: 5000,

  // if true, calls `seneca.die` upon connection loss instead of attempting to reconnect
  die: false,

  // if provided, passed to the consume channel of the actor
  prefetch: 1,

  // all options are provided as first parameter to amqp.connect
  // this includes the following defaults

  protocol: 'amqp',
  hostname: 'localhost',
  port: 5672,
  username: 'guest',
  password: 'guest',
  locale: 'en_US',
  frameMax: 0,
  heartbeat: 0,
  vhost: '/',

  // if provided, this url will be passed as the first param instead
  url = null,

  // if provided, will be passed as second parameter to amqplib.connect
  socketOpts = {

  },

}
```

### rpc (consume)

```js
const server = Seneca()
server.use(Transport, opts)
server.listen({ type: 'amqp', pin: 'role:test,cmd:echo' })
server.add({ role: test, cmd: echo }, (msg, cb) => cb(null, msg))
await new Promise(resolve => server.ready(resolve))

const client = Seneca()
client.use(Transport, opts)
client.client({ type: 'amqp', pin: 'role:test,cmd:echo' })
await new Promise(resolve => client.ready(resolve))
const res = client.act('role:test,cmd:echo', { ok: true }, msg =>
  assert(msg.ok)
)
```

### pubsub (observe)

```js
const server1 = Seneca()
server1.use(Transport, opts)
server1.listen({ type: 'amqp', model: 'observe', pin: 'role:cache,cmd:clear' })
server1.add('role:cache,cmd:clear', (msg, cb) => cb(null, msg))
await new Promise(resolve => server1.ready(resolve))

const server2 = Seneca()
server2.use(Transport, opts)
server2.listen({ type: 'amqp', model: 'observe', pin: 'role:cache,cmd:clear' })
server2.add('role:cache,cmd:clear', (msg, cb) => cb(null, msg))
await new Promise(resolve => server2.ready(resolve))

const client = Seneca()
client.use(Transport, opts)
client.client({ type: 'amqp', model: 'observe', pin: 'role:cache,cmd:clear' })
await new Promise(resolve => client.ready(resolve))

const res = client.act('role:cache,cmd:clear', (err, msg) => {
  // note - you won't get back any meaningul message here, it is always set to {ok: true}
  // you will get errors though if there's a problem publishing to the fanout exchange
  assert(msg.ok)
})
```

## amqp notes / how it works

### consume

- A queue name is derived from the pin (typically prefix with `seneca_`, delimit kv pairs by `_`)
- For `listen` - the derived queueName is asserted as an `autoDelete` queue with the defined `prefetch` in the options. We consume the queue and send replies back to the `replyTo` property.
- For `client` - an exclusive/delete queue is created. messages are sent to the derived queueName with a `replyTo` on this queue. Any returns are returned to the client as `unrouted` errors

### observe

- an exchange name is derived from the pin (typically prefix with `seneca_`, delimit kv pairs by `_`)
- For `listen` - the derived exchange name is asserted as `autoDelete`, a new queue is created and bound to the exchange. We consume this new queue and call the seneca action.
- For `client` - each of the derived exchange names is asserted as `autoDelete`. Acting into the pin will publish the defined message to the exchange.

## License

MIT
