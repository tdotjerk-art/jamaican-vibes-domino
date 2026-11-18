'use strict';
const { server } = require('../server');
server.listen(0, '127.0.0.1', () => {
  if (process.send) process.send({ port: server.address().port });
});
