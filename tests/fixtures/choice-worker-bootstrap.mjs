// Author: CA
import {parentPort} from 'node:worker_threads';
globalThis.self={onmessage:null,postMessage:value=>parentPort.postMessage(value)};
await import('../../dist/choices-worker.mjs');
parentPort.on('message',data=>self.onmessage({data}));
