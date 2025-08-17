// Network and peer types
export type Protocol = 'http' | 'https' | 'udp';

export interface Tracker {
  url: string;
  protocol: Protocol;
}

export interface Peer {
  ip: string;
  port: number;
  id?: Buffer;
}
