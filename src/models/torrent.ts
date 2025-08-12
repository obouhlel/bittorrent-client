export interface TorrentFile {
  announce: string;
  'announce-list'?: string[][];
  info: Info;
  'creation date'?: number;
  'created by'?: string;
  comment?: string;
  encoding?: string;
}

export interface Info {
  name: string;
  pieces: Buffer;
  'piece length': number;
  length?: number; // Single file mode
  files?: FileInfo[]; // Multi-file mode
  private?: number;
  'path.utf-8'?: string;
  'name.utf-8'?: string;
}

export interface FileInfo {
  length: number;
  path: string[];
  'path.utf-8'?: string[];
}

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

export interface Piece {
  index: number;
  hash: Buffer;
  length: number;
  downloaded: boolean;
  blocks?: Block[];
}

export interface Block {
  offset: number;
  length: number;
  data?: Buffer;
}

export interface InfoHashResult {
  buffer: Buffer;
  hex: string;
}

export type BencodeValue = number | string | Buffer | BencodeArray | BencodeDict;
export type BencodeArray = BencodeValue[];
export interface BencodeDict {
  [key: string]: BencodeValue;
}
