import { describe, it, expect } from 'bun:test';
import { decodeTorrent, encode } from '../src/bencode.js';

describe('decodeTorrent validation integration', () => {
  it('should throw error for invalid torrent - missing announce', () => {
    const invalidTorrent = {
      info: {
        name: 'test',
        'piece length': 32768,
        pieces: Buffer.alloc(20),
        length: 1000,
      },
    };

    const encoded = encode(invalidTorrent);
    expect(() => decodeTorrent(encoded)).toThrow('Invalid torrent file');
    expect(() => decodeTorrent(encoded)).toThrow('Missing announce URL');
  });

  it('should throw error for invalid piece length (not power of 2)', () => {
    const invalidTorrent = {
      announce: 'http://test.com',
      info: {
        name: 'test',
        'piece length': 1000,
        pieces: Buffer.alloc(20),
        length: 1000,
      },
    };

    const encoded = encode(invalidTorrent);
    expect(() => decodeTorrent(encoded)).toThrow('Invalid torrent file');
    expect(() => decodeTorrent(encoded)).toThrow('Piece length must be a power of 2');
  });

  it('should throw error for mismatched piece count', () => {
    const invalidTorrent = {
      announce: 'http://test.com',
      info: {
        name: 'test',
        'piece length': 32768,
        pieces: Buffer.alloc(40),
        length: 100000,
      },
    };

    const encoded = encode(invalidTorrent);
    expect(() => decodeTorrent(encoded)).toThrow('Invalid torrent file');
    expect(() => decodeTorrent(encoded)).toThrow('Piece count mismatch');
  });

  it('should successfully decode valid torrent', () => {
    const validTorrent = {
      announce: 'http://test.com',
      info: {
        name: 'test',
        'piece length': 32768,
        pieces: Buffer.alloc(80), // 4 pieces for 100000 bytes
        length: 100000,
      },
    };

    const encoded = encode(validTorrent);
    const decoded = decodeTorrent(encoded);

    expect(decoded.announce).toBe('http://test.com');
    expect(decoded.info.name).toBe('test');
    expect(decoded.info['piece length']).toBe(32768);
    expect(decoded.info.length).toBe(100000);
  });
});
