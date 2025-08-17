import type { Socket } from 'bun';
import { TCP_TIMEOUT } from '~/config';
import { log } from '~/utils/system/logging';

export class PeerConnection {
  private socket: Socket | null = null;
  private buffer: Uint8Array = new Uint8Array(0);

  constructor(
    private ip: string,
    private port: number,
    private onMessage: (message: Uint8Array) => void,
    private onError: (error: Error) => void
  ) {}

  async connect(): Promise<boolean> {
    try {
      this.socket = await Bun.connect({
        hostname: this.ip,
        port: this.port,

        socket: {
          open: () => {
            log('info', `Connect to ${this.ip}:${this.port}`);
          },

          data: (_socket, data) => {
            this.buffer = this.appendBuffer(this.buffer, data);
            this.parseMessages();
          },

          close: (_socket) => {
            this.socket = null;
          },

          error: (_socket, error) => {
            this.onError(error);
            this.socket = null;
          },

          timeout: (socket) => {
            socket.timeout(TCP_TIMEOUT);
          },
        },
      });

      return true;
    } catch (error) {
      log(
        'debug',
        `${error instanceof Error ? error.message : 'Unknown error'} (${this.ip}:${this.port})`
      );
      return false;
    }
  }

  send(data: Uint8Array): void {
    if (!this.socket) {
      throw new Error('Not connected');
    }

    this.socket.write(data);
  }

  close(): void {
    this.socket?.end();
    this.socket = null;
  }

  isConnected(): boolean {
    return this.socket !== null;
  }

  private appendBuffer(buffer1: Uint8Array, buffer2: Uint8Array): Uint8Array {
    const result = new Uint8Array(buffer1.length + buffer2.length);
    result.set(buffer1);
    result.set(buffer2, buffer1.length);
    return result;
  }

  private parseMessages(): void {
    while (this.buffer.length > 0) {
      if (this.buffer.length >= 68 && this.buffer[0] === 19) {
        const handshake = this.buffer.slice(0, 68);
        this.onMessage(handshake);
        this.buffer = this.buffer.slice(68);
        continue;
      }

      if (this.buffer.length >= 4) {
        const messageLength =
          ((this.buffer[0] ?? 0) << 24) |
          ((this.buffer[1] ?? 0) << 16) |
          ((this.buffer[2] ?? 0) << 8) |
          (this.buffer[3] ?? 0);

        const totalLength = 4 + messageLength;
        if (this.buffer.length < totalLength) {
          break;
        }

        const message = this.buffer.slice(0, totalLength);
        this.onMessage(message);

        this.buffer = this.buffer.slice(totalLength);
      } else {
        break;
      }
    }
  }
}
