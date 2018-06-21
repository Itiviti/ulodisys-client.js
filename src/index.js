const net = require('net');
const zlib = require('zlib');
const xml2js = require('xml2js');
const EventEmitter = require('events');

var xmlBuilder = new xml2js.Builder({headless: true, renderOpts: {pretty: false}});
var sax = require("sax")

var lastActionId = 1, lastRequestId = 1;

export class OdisysClient extends EventEmitter {
  constructor({compressed}) {
    super()
    this.compressor = compressed ? zlib : {
      // Lazy no-compress version
      deflate(msg   , cb) { cb(undefined, Buffer.from(msg)) },
      inflate(buffer, cb) { cb(undefined, buffer) },
      deflateSync(msg   ) { return Buffer.from(msg) },
      inflateSync(buffer) { return buffer }
    }
  }

  bindSocket(client) {
    let saxStream = sax.createStream(true, {trim: false, normalize: false})
    let stack = []
    var buffer = new Buffer(0)
    client.on('data', data => {
      buffer = Buffer.concat([buffer, data])
      var start = buffer.indexOf('<msg>', 0, 'ascii')
      var end = start < 0 ? -1 : buffer.indexOf('</msg>', start+5, 'ascii')
      while (end>0) {
        let b = this.compressor.inflateSync(buffer.slice(start+5,end))
        saxStream.write(b)
        buffer = buffer.slice(end+6)
        start = buffer.indexOf('<msg>', 0, 'ascii')
        end = start < 0 ? -1 : buffer.indexOf('</msg>', start+5, 'ascii')
      }
    })
    saxStream.on('error', this.error.bind(this))
    saxStream.on("opentag", node => {
      // sax doesn't really support consecutive roots, but this makes it work just fine
      saxStream._parser.closedRoot = false
      var obj = {}
      if (Object.keys(node.attributes).length > 0)
        obj.$ = node.attributes
      obj.$name = node.name
      stack.push(obj)
    })
    saxStream.on("closetag", () => {
      var obj = stack.pop()
      var s = stack[stack.length - 1]
      if(stack.length > 0)
        assignOrPush(s, obj)
      else {
        this.emit('message', { [obj.$name] : obj })
      }
    })
    saxStream.on("text", text => {
      var s = stack[stack.length - 1]
      if (s._ === undefined) s._ = ""
      s._ += text
    })
    this.socket = client
    this.emit('connected')
  }

  start({host = 'localhost', port = 2098, ...args}) {
    let client = net.connect({host, port}, () => {
      this.bindSocket(client)
    });
    client.on('close', this.close.bind(this))
    client.on('error', this.error.bind(this))
    this.logon(...args)
  }

  logon({user, password, heartbeatInterval = 30000}) {
    this.hb = () => this.sendActionAsync({$: {type: 'heartbeat'}})

    this.sendActionAsync({$: {type: 'user.logon'}, user: {$:{id: user, password}}})
        .then(() => {
          this.emit('logged')
          if (heartbeatInterval > 0) setInterval(hb, heartbeatInterval)
        }, e => this.error(e))
  }

  close() {
    this.emit('close')
    this.cleanup()
  }

  cleanup() {
    if (this.socket) {
      this.socket.close()
      this.socket = undefined
    }
    if (hb) clearInterval(hb)
  }

  error(e) {
    this.emit('error', e)
    this.cleanup()
  }

  send(m) {
    let msg = xmlBuilder.buildObject(m)
    if (this.socket) {
      this.emit('sending', msg)
      let buffer = this.compressor.deflateSync(msg)
      this.socket.write('<msg>', 'ascii')
      this.socket.write(buffer)
      this.socket.write('</msg>', 'ascii')
    } else {
      this.emit('error', `Can't send message (not connected): ${msg}`)
    }
  }

  // send the given action, returns a promise with the action ack
  sendActionAsync(action) {
    if (action.$.id === undefined) action.$.id = lastActionId++
    return new Promise((resolve, reject) => {
      let cb = ({ack, rej}) => {
        if (ack && ack.$.actionid == action.$.id) {
          resolve(ack)
          this.removeListener('message', cb)
        }
        if (rej && rej.$.actionid == action.$.id) {
          reject({code: rej.$.code, message: rej.$.text})
          this.removeListener('message', cb)
        }
      }
      this.on('message', cb)
      this.send({action})
    });
  }

  // send the given request, returns a promise with an array of replies
  sendRequestAsync(request) {
    if (request.$.id === undefined) request.$.id = lastRequestId++
    return new Promise(function(resolve, reject) {
      let cb = ({reply, rej}) => {
        let replies = []
        if (reply && reply.$.requestid == request.$.id) {
          replies.push(reply)
          if (reply.$.total === reply.$.index) {
            resolve(replies)
            this.removeListener('message', cb)
          }
        }
        if (rej && rej.$.requestid == request.$.id) {
          reject({code: rej.$.code, message: rej.$.text})
          this.removeListener('message', cb)
        }
      }
      this.on('message', cb)
      this.send({request})
    });
  }
}

function assignOrPush(s, obj) {
  var name = obj.$name
  if (s[name] !== undefined)
    if (Array.isArray(s[name]))
      s[name].push(obj)
    else
      s[name] = [s[name], obj]
  else
    s[name] = obj
  if (!s.$children) s.$children = []
  s.$children.push(obj)
}

