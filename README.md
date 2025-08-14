# bittorrent-client

![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun&logoColor=white)

A BitTorrent client implementation supporting both HTTP and UDP trackers.

## Installation

Need to install bun before at this [link](https://bun.com/docs/installation)

To install dependencies:

```bash
bun install
```

## Usage

At the default you will use the torrents file `torrents/BigBuckBunny_124_archive.torrent`, copy and paste the `.env.example` and rename it to `.env`. And change your torrent file if you want.

To run in development mode:

```bash
bun dev
```

Example output:

```log
$ bun run --watch src/index.ts
[10:24:08] INFO    BitTorrent client v1.0.0
[10:24:08] INFO    BitTorrent client starting...
[10:24:08] INFO    Loading torrent file: ./torrents/BigBuckBunny_124_archive.torrent
[10:24:08] SUCCESS Torrent loaded: BigBuckBunny_124
[10:24:08] INFO    Size: 420.95 MB (441,396,773 bytes)
[10:24:08] INFO    Piece length: 512 KB
[10:24:08] INFO    Total pieces: 842
[10:24:08] INFO    Info hash: 5e7886d42a52ae66da4541d88882a04f9a34a649
[10:24:08] INFO    Announce list contains 2 tracker(s)
[10:24:08] DEBUG   HTTP trackers: 2
[10:24:08] INFO    Starting announce phase...
[10:24:08] DEBUG   Port: 6881
[10:24:08] DEBUG   Requesting 50 peers
[10:24:08] INFO    Contacting tracker: http://bt1.archive.org:6969/announce
[10:24:08] DEBUG   Protocol: HTTP
[10:24:08] DEBUG   Sending announce request...
[10:24:09] SUCCESS Tracker responded successfully
[10:24:09] INFO    Peers: 9 | Seeders: 7 | Leechers: 2
[10:24:09] INFO    Next announce in: 1878 seconds
[10:24:09] DEBUG   Added 9 new unique peer(s)
[10:24:09] INFO    Sufficient peers found, stopping tracker search
[10:24:09] INFO    Announce phase complete
[10:24:09] SUCCESS Total unique peers collected: 9
[10:24:09] INFO    Ready to start peer connections
[10:24:09] INFO    Shutting down...
```

To build for production:

```bash
bun run build
```

To run the built version:

```bash
bun run prod
```

## Project Structure

```
bittorrent-client/
├── src/
│   ├── index.ts                    # Main entry point
│   ├── env.ts                      # Environment configuration
│   ├── models/                     # Core domain models and business logic
│   │   ├── peer/                   # Peer connection management
│   │   │   ├── connection.ts       # TCP connection handling
│   │   │   ├── message-handler.ts  # BitTorrent protocol message processing
│   │   │   └── piece-manager.ts    # Piece download coordination
│   │   ├── storage/                # File storage and download management
│   │   │   ├── download-manager.ts # Download orchestration and progress tracking
│   │   │   └── file-manager.ts     # File I/O operations
│   │   ├── torrents/               # Torrent file processing
│   │   │   └── metadata.ts         # Torrent metadata extraction and validation
│   │   └── trackers/               # Tracker communication
│   │       ├── http-tracker.ts     # HTTP tracker protocol implementation
│   │       ├── udp-tracker.ts      # UDP tracker protocol implementation
│   │       └── tracker-manager.ts  # Tracker selection and failover logic
│   ├── types/                      # TypeScript type definitions
│   │   └── index.ts                # Shared types and interfaces
│   └── utils/                      # Utility functions and helpers
│       ├── protocol/               # BitTorrent protocol utilities
│       │   ├── bitfield.ts         # Bitfield operations for piece tracking
│       │   ├── handcheck.ts        # Handshake protocol implementation
│       │   ├── message.ts          # Protocol message parsing
│       │   ├── message-builder.ts  # Protocol message construction
│       │   └── peer-id.ts          # Peer ID generation
│       ├── storage/                # Storage utilities
│       │   ├── download.ts         # Download helper functions
│       │   └── recovery.ts         # Download recovery and resume logic
│       ├── system/                 # System utilities
│       │   ├── constants.ts        # Application constants
│       │   └── logging.ts          # Logging configuration and utilities
│       ├── torrent/                # Torrent file utilities
│       │   ├── bencode.ts          # Bencode encoder/decoder
│       │   ├── hash.ts             # SHA-1 hashing for info_hash
│       │   ├── torrent.ts          # Torrent file parsing
│       │   └── validator.ts        # Torrent data validation
│       └── tracker/                # Tracker utilities
│           └── tracker.ts          # Common tracker functions
├── tests/                          # Test files
│   ├── bencode.test.ts            # Bencode parsing tests
│   ├── decode-validation.test.ts  # Validation tests
│   └── metadata.test.ts           # Metadata extraction tests
├── torrents/                       # Sample torrent files
├── dist/                           # Compiled JavaScript output
├── package.json                    # Project dependencies
├── tsconfig.json                   # TypeScript configuration
└── .env                           # Environment variables
```

### Architecture Overview

The BitTorrent client follows a modular architecture with clear separation of concerns:

#### Core Components

1. **Models Layer** (`src/models/`)
   - Contains the main business logic and domain models
   - Each subdirectory represents a major feature area (peers, storage, torrents, trackers)
   - Implements the core BitTorrent protocol logic

2. **Utils Layer** (`src/utils/`)
   - Provides reusable utility functions
   - Handles low-level protocol operations
   - Manages system interactions and logging

3. **Types** (`src/types/`)
   - Centralized TypeScript type definitions
   - Ensures type safety across the application

#### Key Features

- **Multi-Tracker Support**: Handles both HTTP and UDP tracker protocols with automatic failover
- **Peer Management**: Manages concurrent peer connections with message handling
- **Piece Management**: Coordinates piece downloads with validation and recovery
- **Storage Management**: Efficient file I/O with support for multi-file torrents
- **Bencode Parser**: Complete implementation of the BitTorrent encoding format
- **Resume Support**: Download recovery and resume capabilities
- **Logging System**: Comprehensive logging with different log levels

## Bencode Implementation

This client includes a comprehensive Bencode parser and encoder implementation (`src/utils/bencode.ts`) that handles the BitTorrent encoding format.

### Bencode Format Support

The implementation supports all Bencode data types:

- **Integers**: Encoded as `i<integer>e` (e.g., `i42e` for 42)
- **Strings**: Encoded as `<length>:<string>` (e.g., `4:spam` for "spam")
- **Lists**: Encoded as `l<contents>e` (e.g., `l4:spam4:eggse` for ["spam", "eggs"])
- **Dictionaries**: Encoded as `d<contents>e` with sorted keys (e.g., `d3:cow3:moo4:spam4:eggse`)

### Key Functions

#### `decode(data: Buffer | string): BencodeValue`
Parses Bencode data into JavaScript objects. Handles both Buffer and string inputs.

#### `encode(value: BencodeValue | string): Buffer`
Encodes JavaScript objects back to Bencode format. Automatically sorts dictionary keys as required by the BitTorrent specification.

#### `decodeTorrent(data: Buffer | string): TorrentFile`
Specialized function for parsing `.torrent` files with validation. Extracts all standard torrent metadata including:
- Announce URLs and tracker lists
- File information (single file or multi-file torrents)
- Piece hashes and piece length
- Creation date, creator, and comments
- Private torrent flags

### Error Handling

The parser includes comprehensive error handling for:
- Malformed Bencode data
- Invalid character sequences
- Buffer boundary violations
- Missing required torrent fields

All parsing functions validate input data and throw descriptive errors for debugging.

## Tracker Protocol Documentation

This client implements communication with both HTTP and UDP trackers as defined in the BitTorrent protocol.

### HTTP Tracker Protocol

HTTP trackers use simple HTTP GET requests with URL-encoded parameters to communicate with peers.

#### HTTP Announce Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `info_hash` | string | Yes | URL-encoded 20-byte SHA-1 hash of the torrent info dictionary |
| `peer_id` | string | Yes | URL-encoded 20-byte peer ID |
| `port` | number | Yes | Port the client is listening on (default: 6881) |
| `uploaded` | number | Yes | Total bytes uploaded by the client |
| `downloaded` | number | Yes | Total bytes downloaded by the client |
| `left` | number | Yes | Number of bytes left to download |
| `compact` | number | Yes | Set to 1 for compact peer format |
| `event` | string | No | Event type: 'started', 'stopped', or 'completed' |
| `numwant` | number | No | Number of peers desired (default: 50) |

#### HTTP Response Format

The tracker responds with a bencoded dictionary containing:

| Field | Type | Description |
|-------|------|-------------|
| `interval` | number | Seconds to wait before next announce |
| `peers` | buffer/array | Compact format (6 bytes per peer) or list of peer dictionaries |
| `complete` | number | Number of peers with complete file (seeders) |
| `incomplete` | number | Number of peers downloading (leechers) |
| `failure reason` | string | Error message if request failed |

### UDP Tracker Protocol

UDP trackers use a binary protocol with structured message formats for efficient communication.

#### UDP Connect Request

The connect request establishes a connection with the tracker.

| Offset | Size | Type | Description |
|--------|------|------|-------------|
| 0 | 8 | uint64 | Protocol ID (0x41727101980) |
| 8 | 4 | uint32 | Action (0 = connect) |
| 12 | 4 | uint32 | Transaction ID (random) |

**Total size: 16 bytes**

#### UDP Connect Response

| Offset | Size | Type | Description |
|--------|------|------|-------------|
| 0 | 4 | uint32 | Action (0 = connect) |
| 4 | 4 | uint32 | Transaction ID (must match request) |
| 8 | 8 | uint64 | Connection ID (for subsequent requests) |

**Total size: 16 bytes**

#### UDP Announce Request

| Offset | Size | Type | Description |
|--------|------|------|-------------|
| 0 | 8 | uint64 | Connection ID (from connect response) |
| 8 | 4 | uint32 | Action (1 = announce) |
| 12 | 4 | uint32 | Transaction ID (random) |
| 16 | 20 | bytes | Info hash (SHA-1 of torrent info) |
| 36 | 20 | bytes | Peer ID |
| 56 | 8 | uint64 | Downloaded bytes |
| 64 | 8 | uint64 | Left bytes |
| 72 | 8 | uint64 | Uploaded bytes |
| 80 | 4 | uint32 | Event (0=none, 1=completed, 2=started, 3=stopped) |
| 84 | 4 | uint32 | IP address (0 = use sender's IP) |
| 88 | 4 | uint32 | Key (random) |
| 92 | 4 | int32 | Num want (-1 = default) |
| 96 | 2 | uint16 | Port |

**Total size: 98 bytes**

#### UDP Announce Response

| Offset | Size | Type | Description |
|--------|------|------|-------------|
| 0 | 4 | uint32 | Action (1 = announce) |
| 4 | 4 | uint32 | Transaction ID (must match request) |
| 8 | 4 | uint32 | Interval (seconds) |
| 12 | 4 | uint32 | Leechers |
| 16 | 4 | uint32 | Seeders |
| 20+ | 6n | bytes | Peers (6 bytes each: 4 IP + 2 port) |

#### Tracker Event Values

| Value | Event | Description |
|-------|-------|-------------|
| 0 | none | Regular announce |
| 1 | completed | Download completed |
| 2 | started | Download started |
| 3 | stopped | Download stopped |

### Error Handling

Both protocols support error responses:

- **HTTP**: Uses `failure reason` field in bencoded response
- **UDP**: Uses action value 3 (error) with error message in payload

### Connection Management

- **HTTP**: Stateless, each request is independent
- **UDP**: Requires connection establishment, connection ID expires after inactivity
