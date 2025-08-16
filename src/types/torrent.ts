// Torrent file structure types
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
  length?: number;
  files?: FileInfo[];
  private?: number;
  'path.utf-8'?: string;
  'name.utf-8'?: string;
}

export interface Files {
  index: number;
  path: string;
  length: number;
}

export interface FileInfo {
  length: number;
  path: string[];
  'path.utf-8'?: string[];
}

export interface Piece {
  index: number;
  hash: Buffer;
  length: number;
  downloaded: boolean;
}

export interface InfoHashResult {
  buffer: Buffer;
  hex: string;
}
