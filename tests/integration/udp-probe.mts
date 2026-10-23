// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import { createSocket } from 'node:dgram';
const socket = createSocket('udp4');
if (process.argv[2] === 'listen') {
  socket.on('message', (data) => {
    if (data.toString() === 'udp-ok') process.stdout.write('udp-ok\n');
  });
  socket.bind(18081, '0.0.0.0');
} else if (process.argv[2] === 'send') {
  socket.send('udp-ok', 8081, process.argv[3], (error) => {
    socket.close();
    if (error) process.exitCode = 1;
  });
} else throw new Error('Expected listen or send');
