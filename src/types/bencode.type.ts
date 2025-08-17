// Bencode types
export type BencodeValue = number | string | Buffer | BencodeArray | BencodeDict;
export type BencodeArray = BencodeValue[];
export interface BencodeDict {
  [key: string]: BencodeValue;
}
