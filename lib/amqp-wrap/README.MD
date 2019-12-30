# AMQP Wrapper

This provides a few mechanisms to deal with AMQP connection loss.

## Reconnector

This is the base class. It wraps a generic event emitter that emits the following:

- error
- close

Upon instantiation, it will call into `connect`, which must be implemented.
_NOTE_: connect is an async function, and errors are not handled. Wrap the whole thing in a try/catch

If a connection is established, call `onConnected` with the emitter to setup reconnections.
This function also accepts an optional `setup` which will be awaited prior to firing ready.

Upon receiving `close`, it will attempt to reconnect, unless of course `closing` is set to true.
`closing` gets set to true on all connections/channels when we call into `Connection#close`

Once the connection changes it will emit `ready` or `close` based on if it's connected

## Connection

Wraps the amqp connection object.

**_NOTE_** This is an event emitter which emits error events, make sure to add a handler!

## Channel

Wraps the amqp channel object

**_NOTE_** This is an event emitter which emits error events, make sure to add a handler!
