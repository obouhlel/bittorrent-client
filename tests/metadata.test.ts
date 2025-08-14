import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { TorrentMetadata } from '../src/models/metadata';
import { TorrentFile } from '../src/types';
import { calculateInfoHash } from '../src/utils/torrent/hash';
import { validateTorrent } from '../src/utils/torrent/validator';
import { decodeTorrent } from '../src/utils/torrent/bencode';

describe('TorrentMetadata', () => {
  const torrentPath = './torrents/BigBuckBunny_124_archive.torrent';
  let torrentData: Buffer;
  let torrentFile: TorrentFile;
  let metadata: TorrentMetadata;

  it('should load and parse torrent file', () => {
    torrentData = readFileSync(torrentPath);
    expect(torrentData).toBeDefined();
    expect(torrentData.length).toBeGreaterThan(0);

    torrentFile = decodeTorrent(torrentData);
    expect(torrentFile).toBeDefined();
    expect(torrentFile.announce).toBeDefined();
    expect(torrentFile.info).toBeDefined();
  });

  it('should validate torrent structure', () => {
    const validation = validateTorrent(torrentFile);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(validation.totalSize).toBeGreaterThan(0);
    expect(validation.pieceCount).toBeGreaterThan(0);
  });

  it('should calculate info hash correctly', () => {
    const hashResult = calculateInfoHash(torrentData);
    expect(hashResult).toBeDefined();
    expect(hashResult.buffer).toBeInstanceOf(Buffer);
    expect(hashResult.buffer).toHaveLength(20);
    expect(hashResult.hex).toHaveLength(40);
    expect(hashResult.hex).toMatch(/^[a-f0-9]{40}$/);
  });

  it('should create TorrentMetadata instance', () => {
    metadata = new TorrentMetadata(torrentFile);
    expect(metadata).toBeDefined();
    expect(metadata.name).toBe(torrentFile.info.name);
    expect(metadata.pieceLength).toBe(torrentFile.info['piece length']);
    expect(metadata.totalSize).toBeGreaterThan(0);
    expect(metadata.pieceCount).toBeGreaterThan(0);
  });

  it('should set info hash', () => {
    metadata.setInfoHash(torrentData);
    expect(metadata.infoHash).toHaveLength(40);
    expect(metadata.infoHash).toMatch(/^[a-f0-9]{40}$/);
  });

  it('should calculate piece sizes correctly', () => {
    const lastPieceIndex = metadata.pieceCount - 1;

    for (let i = 0; i < lastPieceIndex; i++) {
      expect(metadata.getPieceSize(i)).toBe(metadata.pieceLength);
    }

    const lastPieceSize = metadata.getPieceSize(lastPieceIndex);
    const expectedLastPieceSize = metadata.totalSize % metadata.pieceLength || metadata.pieceLength;
    expect(lastPieceSize).toBe(expectedLastPieceSize);
    expect(lastPieceSize).toBeLessThanOrEqual(metadata.pieceLength);
  });

  it('should return sorted trackers with HTTP first', () => {
    const trackers = metadata.getTrackers();
    expect(trackers).toBeDefined();
    expect(trackers.length).toBeGreaterThan(0);

    const httpTrackers = trackers.filter((t) => t.protocol === 'http');
    const nonHttpTrackers = trackers.filter((t) => t.protocol !== 'http');

    if (httpTrackers.length > 0 && nonHttpTrackers.length > 0) {
      const firstHttpIndex = trackers.findIndex((t) => t.protocol === 'http');
      const firstNonHttpIndex = trackers.findIndex((t) => t.protocol !== 'http');
      expect(firstHttpIndex).toBeLessThan(firstNonHttpIndex);
    }

    for (let i = 1; i < trackers.length; i++) {
      expect(trackers[i].tier).toBeGreaterThanOrEqual(trackers[i - 1].tier);
    }
  });

  it('should validate piece length is power of 2', () => {
    expect(metadata.pieceLength & (metadata.pieceLength - 1)).toBe(0);
    expect(metadata.pieceLength).toBeGreaterThan(0);
  });

  it('should return correct pieces', () => {
    const pieces = metadata.getPieces();
    expect(pieces).toHaveLength(metadata.pieceCount);

    pieces.forEach((piece, index) => {
      expect(piece.index).toBe(index);
      expect(piece.hash).toHaveLength(20);
      expect(piece.length).toBe(metadata.getPieceSize(index));
      expect(piece.downloaded).toBe(false);
    });
  });

  it('should handle single file or multi-file torrents', () => {
    const files = metadata.getFiles();
    expect(files).toBeDefined();
    expect(files?.length).toBeGreaterThan(0);

    if (metadata.isMultiFile) {
      expect(torrentFile.info.files).toBeDefined();
      expect(files?.length).toBe(torrentFile.info.files?.length ?? 0);
    } else {
      expect(files?.length).toBe(1);
      expect(files?.[0]?.path).toBe(metadata.name);
      expect(files?.[0]?.length).toBe(metadata.totalSize);
    }
  });

  it('should throw error for invalid piece index', () => {
    expect(() => metadata.getPieceSize(-1)).toThrow('Invalid piece index');
    expect(() => metadata.getPieceSize(metadata.pieceCount)).toThrow('Invalid piece index');
  });
});

describe('Validation Edge Cases', () => {
  it('should reject torrent with missing announce', () => {
    const invalidTorrent = {
      info: {
        name: 'test',
        'piece length': 32768,
        pieces: Buffer.alloc(20),
        length: 1000,
      },
    } as TorrentFile;

    expect(() => new TorrentMetadata(invalidTorrent)).toThrow('Invalid torrent');
  });

  it('should reject torrent with invalid piece length', () => {
    const invalidTorrent = {
      announce: 'http://test.com',
      info: {
        name: 'test',
        'piece length': 1000, // Not a power of 2
        pieces: Buffer.alloc(20),
        length: 1000,
      },
    } as TorrentFile;

    expect(() => new TorrentMetadata(invalidTorrent)).toThrow('Invalid torrent');
  });

  it('should reject torrent with mismatched piece count', () => {
    const invalidTorrent = {
      announce: 'http://test.com',
      info: {
        name: 'test',
        'piece length': 32768,
        pieces: Buffer.alloc(40),
        length: 100000,
      },
    } as TorrentFile;

    expect(() => new TorrentMetadata(invalidTorrent)).toThrow('Invalid torrent');
  });
});
