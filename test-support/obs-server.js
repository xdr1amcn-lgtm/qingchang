// Minimal loopback WebSocket fixture. Production uses Node's built-in WebSocket client.
const http=require('node:http'),{createHash}=require('node:crypto'),{EventEmitter}=require('node:events');
function frame(op,data){const payload=Buffer.isBuffer(data)?data:Buffer.from(String(data)),header=Buffer.alloc(payload.length<126?2:4);header[0]=128|op;if(payload.length<126)header[1]=payload.length;else{header[1]=126;header.writeUInt16BE(payload.length,2);}return Buffer.concat([header,payload]);}
class WebSocketServer extends EventEmitter{
 constructor(options){super();this.clients=new Set();this.server=http.createServer();this.server.on('upgrade',(request,socket,head)=>{
  const accept=createHash('sha1').update(request.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\nSec-WebSocket-Protocol: obswebsocket.json\r\n\r\n');
  const peer=new EventEmitter();peer.send=data=>{if(!socket.destroyed)socket.write(frame(1,data));};peer.close=(code=1000,message='')=>{const payload=Buffer.alloc(2+Buffer.byteLength(message));payload.writeUInt16BE(code);payload.write(message,2);if(!socket.destroyed)socket.end(frame(8,payload));};peer.terminate=()=>socket.destroy();this.clients.add(peer);socket.on('close',()=>this.clients.delete(peer));socket.on('error',()=>{});
  let pending=Buffer.alloc(0);const consume=chunk=>{pending=Buffer.concat([pending,chunk]);while(pending.length>=2){const op=pending[0]&15,masked=!!(pending[1]&128);let length=pending[1]&127,offset=2;if(length===126){if(pending.length<4)return;length=pending.readUInt16BE(2);offset=4;}else if(length===127){socket.destroy();return;}if(!masked){socket.destroy();return;}if(pending.length<offset+4+length)return;const mask=pending.subarray(offset,offset+4),data=Buffer.from(pending.subarray(offset+4,offset+4+length));for(let i=0;i<data.length;i++)data[i]^=mask[i%4];pending=pending.subarray(offset+4+length);if(op===1)peer.emit('message',data);else if(op===8){socket.end(frame(8,data));return;}else if(op===9)socket.write(frame(10,data));}};
  socket.on('data',consume);this.emit('connection',peer);if(head.length)consume(head);
 });this.server.on('listening',()=>this.emit('listening'));this.server.listen(options.port,options.host);}
 address(){return this.server.address();}close(callback){return this.server.close(callback);}
}
module.exports={WebSocketServer};
