const expect = require('chai').expect;
const sinon = require('sinon');

import { OdisysClient } from '../src/index.js'
import { EventEmitter } from 'events';

describe('The odisys client', () => {
  let client = new OdisysClient({compressed: false})
  let emitSpy = sinon.spy(client, 'emit')
  let fakeSocket = new EventEmitter()
  client.bindSocket(fakeSocket)
  fakeSocket.write = sinon.spy();
  it('should send logon to server', () => {
    expect(emitSpy.withArgs('connected').calledOnce)
    client.logon({user: 'foo', password: 'bar', heartbeatInterval: -1})
    expect(fakeSocket.write.calledThrice)
    expect(fakeSocket.write.args[1][0].toString()).to.equal('<action type="user.logon" id="1"><user id="foo" password="bar"/></action>')
    expect(emitSpy.withArgs('logged').notCalled)
  })
  it('should send logon to server when using start helper method', () => {
    expect(emitSpy.withArgs('connected').calledOnce)
    // client.start({user: 'foo', password: 'bar', heartbeatInterval: -1})
    client.start({ host: 'localhost', port: 2098, user: 'foo', password: 'bar', heartbeatInterval: -1 })

    expect(fakeSocket.write.calledThrice)
    expect(fakeSocket.write.args[1][0].toString()).to.equal('<action type="user.logon" id="1"><user id="foo" password="bar"/></action>')
    expect(emitSpy.withArgs('logged').notCalled)
  })
  it('should switch state when ack received', () => {
    fakeSocket.emit('data', new Buffer('<msg><ack actionid="1"/>'))
    expect(emitSpy.withArgs('logged').calledOnce)
  })
})

