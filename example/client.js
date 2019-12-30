const { createServer } = require('http')
const Seneca = require('seneca')
const Transport = require('..')

const seneca = Seneca()
seneca.use(Transport)
seneca.client({ type: 'amqp', pin: ['role:second,cmd:*', 'role:test,cmd:*'] })
seneca.ready(() => {
  const app = createServer((req, res) => {
    let cmd = null
    let msg = null
    switch (req.url) {
      case '/echo':
        cmd = 'echo'
        msg = { ok: true }
        break
      case '/error':
        cmd = 'error'
        msg = { msg: 'aw snap' }
        break
      case '/unhandled':
        cmd = 'unhandled'
        msg = { ok: true }
        break
      default:
        res.statusCode = 404
        return res.end('not found')
    }

    seneca.act(`role:test,cmd:${cmd}`, msg, (err, data) => {
      if (err) {
        res.statusCode = 500
        res.end(
          JSON.stringify(
            { ...err, message: err.message, stack: err.stack },
            null,
            4
          )
        )
      } else {
        res.statusCode = 200
        res.end(JSON.stringify(data, null, 4))
      }
    })
  })

  const server = app.listen(8081, () => {
    const addr = server.address()
    console.log(`Listening on ${addr.address}${addr.port}`)
  })
})
