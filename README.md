
# UL ODISYS Node.JS client library

This library allows to connect to an Odisys XML API connection.

## How-to use

```
$ npm install --save ulodisys-client
```

then in your project:

```
import { OdisysClient } from 'ulodisys-client'
...

let client = new OdisysClient({compressed: true})
client.on('message', msg => console.log(`Received: ${msg}`))
client.start({host: 'localhost', port: 2098, user: 'ullink', password: 'ullink', heartbeatInterval: 30000})
client.sendActionAsync({$: {type: 'heartbeat'}})
      .then(ack => console.log('Action acknowledged !'), ({code, message}) => console.error(`Action rejected (${code}): ${message}`))
```

Js objects are translated to XML using [xml2js](https://github.com/Leonidas-from-XIV/node-xml2js):
- elements are mapped from/to properties
- attributes are mapped from/to properties inside `$`
- repeated elements are mapped from/to arrays

# Contributing

## How-to build

```
$ npm run compile
$ npm run test
```
