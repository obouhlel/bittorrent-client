import dgram from 'node:dgram';

export class UDPSocket {
  private socket: dgram.Socket;

  constructor(
    private host: string,
    private port: number,
    private timeout: number
  ) {
    this.socket = dgram.createSocket('udp4');
    this.socket.setMaxListeners(20);
  }

  sendRequest(buffer: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('UDP tracker request timeout'));
      }, this.timeout);

      this.socket.once('message', (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });

      this.socket.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      this.socket.send(buffer, this.port, this.host, (error) => {
        if (error) {
          clearTimeout(timer);
          reject(error);
        }
      });
    });
  }

  close(): void {
    this.socket.close();
  }
}
