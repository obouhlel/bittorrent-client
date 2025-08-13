import type { BencodeValue, BencodeArray, BencodeDict, TorrentFile } from '../models/torrent.js';
import { validateTorrent } from './validator.js';

interface ParseResult<T> {
  value: T;
  position: number;
}

function parseInteger(data: Buffer, position: number): ParseResult<number> {
  if (data[position] !== 0x69) {
    // 'i'
    throw new Error(
      `Expected 'i' at position ${position}, got ${String.fromCharCode(data[position] ?? 0)}`
    );
  }

  position++;
  let numStr = '';
  let isNegative = false;

  if (data[position] === 0x2d) {
    // '-'
    isNegative = true;
    position++;
  }

  while (position < data.length && data[position] !== 0x65) {
    // 'e'
    const char = data[position];
    if (char === undefined || char < 0x30 || char > 0x39) {
      // '0' to '9'
      throw new Error(`Invalid character in integer at position ${position}`);
    }
    numStr += String.fromCharCode(char);
    position++;
  }

  if (data[position] !== 0x65) {
    // 'e'
    throw new Error(`Expected 'e' at position ${position}`);
  }

  position++;

  const value = parseInt(numStr, 10) * (isNegative ? -1 : 1);
  return { value, position };
}

function parseString(data: Buffer, position: number): ParseResult<Buffer> {
  let lengthStr = '';

  while (position < data.length && data[position] !== 0x3a) {
    // ':'
    const char = data[position];
    if (char === undefined || char < 0x30 || char > 0x39) {
      // '0' to '9'
      throw new Error(`Invalid character in string length at position ${position}`);
    }
    lengthStr += String.fromCharCode(char);
    position++;
  }

  if (data[position] !== 0x3a) {
    // ':'
    throw new Error(`Expected ':' at position ${position}`);
  }

  position++;
  const length = parseInt(lengthStr, 10);

  if (position + length > data.length) {
    throw new Error(`String length ${length} exceeds buffer bounds at position ${position}`);
  }

  const value = data.subarray(position, position + length);
  return { value, position: position + length };
}

function parseList(data: Buffer, position: number): ParseResult<BencodeArray> {
  if (data[position] !== 0x6c) {
    // 'l'
    throw new Error(`Expected 'l' at position ${position}`);
  }

  position++;
  const list: BencodeArray = [];

  while (position < data.length && data[position] !== 0x65) {
    // 'e'
    const result = parseValue(data, position);
    list.push(result.value);
    position = result.position;
  }

  if (data[position] !== 0x65) {
    // 'e'
    throw new Error(`Expected 'e' at position ${position}`);
  }

  position++;
  return { value: list, position };
}

function parseDictionary(data: Buffer, position: number): ParseResult<BencodeDict> {
  if (data[position] !== 0x64) {
    // 'd'
    throw new Error(`Expected 'd' at position ${position}`);
  }

  position++;
  const dict: BencodeDict = {};

  while (position < data.length && data[position] !== 0x65) {
    // 'e'
    const keyResult = parseString(data, position);
    const key = keyResult.value.toString('utf8');
    position = keyResult.position;

    const valueResult = parseValue(data, position);
    dict[key] = valueResult.value;
    position = valueResult.position;
  }

  if (data[position] !== 0x65) {
    // 'e'
    throw new Error(`Expected 'e' at position ${position}`);
  }

  position++;
  return { value: dict, position };
}

function parseValue(data: Buffer, position: number): ParseResult<BencodeValue> {
  if (position >= data.length) {
    throw new Error(`Unexpected end of data at position ${position}`);
  }

  const firstByte = data[position];

  if (firstByte === 0x69) {
    // 'i'
    return parseInteger(data, position);
  } else if (firstByte === 0x6c) {
    // 'l'
    return parseList(data, position);
  } else if (firstByte === 0x64) {
    // 'd'
    return parseDictionary(data, position);
  } else if (firstByte !== undefined && firstByte >= 0x30 && firstByte <= 0x39) {
    // '0' to '9'
    return parseString(data, position);
  } else {
    throw new Error(
      `Invalid bencode type at position ${position}: ${String.fromCharCode(firstByte ?? 0)}`
    );
  }
}

export function decode(data: Buffer | string): BencodeValue {
  const buffer = typeof data === 'string' ? Buffer.from(data) : data;
  const result = parseValue(buffer, 0);

  if (result.position !== buffer.length) {
    throw new Error(`Unexpected data after position ${result.position}`);
  }

  return result.value;
}

export function encode(value: BencodeValue | string): Buffer {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error('Only integers are supported in bencode');
    }
    return Buffer.from(`i${value}e`);
  }

  if (typeof value === 'string') {
    const buffer = Buffer.from(value);
    return Buffer.concat([Buffer.from(`${buffer.length}:`), buffer]);
  }

  if (Buffer.isBuffer(value)) {
    return Buffer.concat([Buffer.from(`${value.length}:`), value]);
  }

  if (Array.isArray(value)) {
    const parts: Buffer[] = [Buffer.from('l')];
    for (const item of value) {
      parts.push(encode(item));
    }
    parts.push(Buffer.from('e'));
    return Buffer.concat(parts);
  }

  if (value && typeof value === 'object') {
    const parts: Buffer[] = [Buffer.from('d')];
    const sortedKeys = Object.keys(value).sort();

    for (const key of sortedKeys) {
      parts.push(encode(key));
      const dictValue = (value as BencodeDict)[key];
      if (dictValue !== undefined) {
        parts.push(encode(dictValue));
      }
    }

    parts.push(Buffer.from('e'));
    return Buffer.concat(parts);
  }

  throw new Error(`Cannot encode value of type ${typeof value}`);
}

function bufferToString(value: BencodeValue | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return undefined;
}

export function decodeTorrent(data: Buffer | string): TorrentFile {
  const decoded = decode(data) as BencodeDict;

  const announceStr = bufferToString(decoded.announce);
  const info = decoded.info as BencodeDict;
  const nameStr = bufferToString(info?.name);

  const torrentFile: TorrentFile = {
    announce: announceStr || '',
    info: {
      name: nameStr || '',
      'piece length': (info?.['piece length'] as number) || 0,
      pieces: Buffer.isBuffer(info?.pieces) ? info.pieces : Buffer.alloc(0),
    },
  };

  if (decoded['announce-list'] && Array.isArray(decoded['announce-list'])) {
    torrentFile['announce-list'] = decoded['announce-list'].map((tier) =>
      Array.isArray(tier)
        ? tier.map((url) => bufferToString(url)).filter((url): url is string => !!url)
        : []
    );
  }

  const createdBy = bufferToString(decoded['created by']);
  if (createdBy) {
    torrentFile['created by'] = createdBy;
  }

  if (decoded['creation date'] && typeof decoded['creation date'] === 'number') {
    torrentFile['creation date'] = decoded['creation date'];
  }

  const comment = bufferToString(decoded.comment);
  if (comment) {
    torrentFile.comment = comment;
  }

  const encoding = bufferToString(decoded.encoding);
  if (encoding) {
    torrentFile.encoding = encoding;
  }

  if (info.length && typeof info.length === 'number') {
    torrentFile.info.length = info.length;
  }

  if (info.files && Array.isArray(info.files)) {
    torrentFile.info.files = info.files.map((file) => {
      const fileDict = file as BencodeDict;
      const pathArray = Array.isArray(fileDict.path)
        ? fileDict.path.map((p) => bufferToString(p)).filter((p): p is string => !!p)
        : [];

      return {
        length: fileDict.length as number,
        path: pathArray,
      };
    });
  }

  if (info.private && typeof info.private === 'number') {
    torrentFile.info.private = info.private;
  }

  const validation = validateTorrent(torrentFile);
  if (!validation.valid) {
    throw new Error(`Invalid torrent file: ${validation.errors.join(', ')}`);
  }

  return torrentFile;
}
