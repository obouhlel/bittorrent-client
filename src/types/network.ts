// Network and peer types
export interface Tracker {
  url: string;
  tier: number;
  protocol: 'http' | 'https' | 'udp';
}

export interface Peer {
  ip: string;
  port: number;
  id?: Buffer;
}
