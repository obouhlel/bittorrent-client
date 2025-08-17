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
        cleanup();
        reject(new Error('UDP tracker request timeout'));
      }, this.timeout);

      const messageHandler = (msg: Buffer) => {
        cleanup();
        resolve(msg);
      };

      const errorHandler = (error: Error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.socket.removeListener('message', messageHandler);
        this.socket.removeListener('error', errorHandler);
      };

      this.socket.once('message', messageHandler);
      this.socket.once('error', errorHandler);

      this.socket.send(buffer, this.port, this.host, (error) => {
        if (error) {
          cleanup();
          reject(error);
        }
      });
    });
  }

  close(): void {
    this.socket.close();
  }
}
