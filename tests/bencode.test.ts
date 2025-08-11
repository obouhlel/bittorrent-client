import { describe, it, expect } from 'bun:test';
import type { BencodeValue } from '../src/bencode';
import { decode, encode } from '../src/bencode';

describe('Bencode Parser', () => {
  describe('decode', () => {
    it('should parse integers', () => {
      expect(decode(Buffer.from('i42e'))).toBe(42);
      expect(decode(Buffer.from('i-42e'))).toBe(-42);
      expect(decode(Buffer.from('i0e'))).toBe(0);
    });

    it('should parse strings', () => {
      expect(decode(Buffer.from('5:hello'))).toEqual(Buffer.from('hello'));
      expect(decode(Buffer.from('0:'))).toEqual(Buffer.from(''));
      expect(decode(Buffer.from('11:hello world'))).toEqual(Buffer.from('hello world'));
    });

    it('should parse lists', () => {
      expect(decode(Buffer.from('le'))).toEqual([]);
      expect(decode(Buffer.from('li42ee'))).toEqual([42]);
      expect(decode(Buffer.from('li42e5:helloe'))).toEqual([42, Buffer.from('hello')]);
      expect(decode(Buffer.from('lli1ei2eee'))).toEqual([[1, 2]]);
    });

    it('should parse dictionaries', () => {
      expect(decode(Buffer.from('de'))).toEqual({});
      expect(decode(Buffer.from('d3:agei25ee'))).toEqual({ age: 25 });
      expect(decode(Buffer.from('d3:agei25e4:name4:Johne'))).toEqual({
        age: 25,
        name: Buffer.from('John'),
      });
    });

    it('should parse complex structures', () => {
      const complexBencode = 'd8:announce32:http://tracker.example.com:8080/e';
      const result = decode(Buffer.from(complexBencode));
      expect(result).toEqual({
        announce: Buffer.from('http://tracker.example.com:8080/'),
      });
    });

    it('should throw on invalid input', () => {
      expect(() => decode(Buffer.from('invalid'))).toThrow(
        'Invalid character in integer at position 1'
      );
      expect(() => decode(Buffer.from('i42'))).toThrow("Expected 'e' at position 3");
      expect(() => decode(Buffer.from('5:hi'))).toThrow(
        'String length 5 exceeds buffer bounds at position 2'
      );
      expect(() => decode(Buffer.from('l'))).toThrow("Expected 'e' at position 1");
      expect(() => decode(Buffer.from('d3:key'))).toThrow('Unexpected end of data at position 6');
    });
  });

  describe('encode', () => {
    it('should encode integers', () => {
      expect(encode(42).toString()).toBe('i42e');
      expect(encode(-42).toString()).toBe('i-42e');
      expect(encode(0).toString()).toBe('i0e');
    });

    it('should encode strings', () => {
      expect(encode('hello').toString()).toBe('5:hello');
      expect(encode('').toString()).toBe('0:');
      expect(encode('hello world').toString()).toBe('11:hello world');
    });

    it('should encode buffers', () => {
      expect(encode(Buffer.from('hello')).toString()).toBe('5:hello');
    });

    it('should encode lists', () => {
      expect(encode([]).toString()).toBe('le');
      expect(encode([42]).toString()).toBe('li42ee');
      expect(encode([42, 'hello']).toString()).toBe('li42e5:helloe');
      expect(encode([[1, 2]]).toString()).toBe('lli1ei2eee');
    });

    it('should encode dictionaries', () => {
      expect(encode({}).toString()).toBe('de');
      expect(encode({ age: 25 }).toString()).toBe('d3:agei25ee');
      expect(encode({ name: 'John', age: 25 }).toString()).toBe('d3:agei25e4:name4:Johne');
    });

    it('should sort dictionary keys', () => {
      const dict = { z: 1, a: 2, m: 3 };
      expect(encode(dict).toString()).toBe('d1:ai2e1:mi3e1:zi1ee');
    });

    it('should handle roundtrip encoding/decoding', () => {
      const testCases: BencodeValue[] = [
        42,
        'hello world',
        [],
        [1, 2, 3],
        { key: 'value' },
        { nested: { structure: [1, 2, { deep: 'value' }] } },
      ];

      for (const testCase of testCases) {
        const encoded = encode(testCase);
        const decoded = decode(encoded);

        const normalize = (val: BencodeValue): BencodeValue => {
          if (Buffer.isBuffer(val)) return val.toString();
          if (Array.isArray(val)) return val.map(normalize);
          if (val && typeof val === 'object') {
            const result: Record<string, BencodeValue> = {};
            for (const [k, v] of Object.entries(val)) {
              result[k] = normalize(v);
            }
            return result;
          }
          return val;
        };

        expect(normalize(decoded)).toEqual(normalize(testCase));
      }
    });
  });
});
