# BitTorrent Client Implementation

![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)

Un client BitTorrent complet implémenté en TypeScript avec Bun, supportant les protocoles HTTP et UDP pour la communication avec les trackers, ainsi que l'intégralité du protocole peer-to-peer BitTorrent.

## Table des matières

- [Installation](#installation)
- [Utilisation](#utilisation)
- [Architecture du projet](#architecture-du-projet)
- [Protocole BitTorrent - Guide complet](#protocole-bittorrent---guide-complet)
- [Structure du code](#structure-du-code)
- [Tests](#tests)

## Installation

### Prérequis

Installer Bun via ce [lien](https://bun.com/docs/installation)

### Installation des dépendances

```bash
bun install
```

## Utilisation

### Configuration

1. Copiez le fichier `.env.example` et renommez-le en `.env`
2. Modifiez le chemin vers votre fichier torrent si nécessaire
3. Par défaut, le client utilise le fichier `torrents/BigBuckBunny_124_archive.torrent`

### Commandes

```bash
# Mode développement
bun dev

# Build pour production
bun run build

# Exécuter la version buildée
bun run prod

# Formater le code
bun format

# Vérification lint
bun lint

# Vérification des types
bun typecheck

# Tests
bun test
```

## Architecture du projet

```
bittorrent-client/
├── src/
│   ├── index.ts                    # Point d'entrée principal
│   ├── config.ts                   # Configuration et constantes
│   ├── env.ts                      # Variables d'environnement
│   ├── models/                     # Modèles métier et logique principale
│   │   ├── bittorrent.ts           # Orchestrateur principal du client
│   │   ├── peer/                   # Gestion des connexions peers
│   │   │   ├── peer-manager.ts     # Gestionnaire des connexions peers
│   │   │   ├── peer-connection.ts  # Connexion TCP individuelle
│   │   │   └── message-handler.ts  # Traitement des messages protocole
│   │   ├── piece/                  # Gestion des pièces
│   │   │   ├── piece-manager.ts    # Gestionnaire des pièces et blocs
│   │   │   ├── request-manager.ts  # Gestionnaire des requêtes de blocs
│   │   │   └── selection-strategy.ts # Stratégies de sélection des pièces
│   │   ├── torrents/               # Traitement des fichiers torrents
│   │   │   ├── metadata.ts         # Extraction des métadonnées
│   │   │   └── metadata.interface.ts # Interfaces métadonnées
│   │   └── trackers/               # Communication avec les trackers
│   │       ├── tracker-manager.ts  # Gestionnaire multi-trackers
│   │       ├── http/               # Protocole HTTP tracker
│   │       │   ├── http-tracker.ts
│   │       │   └── http-client.ts
│   │       └── udp/                # Protocole UDP tracker
│   │           ├── udp-tracker.ts
│   │           └── udp-socket.ts
│   ├── types/                      # Définitions TypeScript
│   │   ├── *.type.ts               # Types spécialisés par domaine
│   │   └── index.ts                # Exports centralisés
│   └── utils/                      # Fonctions utilitaires
│       ├── protocol/               # Utilitaires protocole BitTorrent
│       │   ├── bitfield.ts         # Opérations sur les bitfields
│       │   ├── handshake.ts        # Protocole de handshake
│       │   ├── message-builder.ts  # Construction des messages
│       │   ├── message-parser.ts   # Parsing des messages
│       │   ├── peer-builder.ts     # Construction des peers
│       │   └── peer-id.ts          # Génération des IDs peers
│       ├── storage/                # Utilitaires de stockage
│       │   ├── block-utils.ts      # Opérations sur les blocs
│       │   ├── file-operations.ts  # Opérations fichiers
│       │   ├── hash-verification.ts # Vérification des hashes
│       │   ├── multifile-assembler.ts # Assemblage multi-fichiers
│       │   └── piece-request-utils.ts # Utilitaires requêtes pièces
│       ├── system/                 # Utilitaires système
│       │   ├── logging.ts          # Système de logs
│       │   └── stats.ts            # Statistiques téléchargement
│       ├── torrent/                # Utilitaires torrents
│       │   ├── bencode.ts          # Encodeur/décodeur Bencode
│       │   ├── hash.ts             # Calculs de hash SHA-1
│       │   ├── trackers.ts         # Parsing des trackers
│       │   └── validator.ts        # Validation des torrents
│       └── tracker/                # Utilitaires trackers
│           ├── discovery.ts        # Découverte des peers
│           ├── factory.ts          # Factory des trackers
│           ├── http-protocol.ts    # Protocole HTTP
│           ├── udp-protocol.ts     # Protocole UDP
│           ├── peer.ts             # Utilitaires peers
│           └── sort.ts             # Tri des trackers
├── tests/                          # Tests unitaires
├── torrents/                       # Fichiers torrents d'exemple
└── downloads/                      # Dossier de téléchargement
```

## Protocole BitTorrent - Guide complet

### Vue d'ensemble

Le protocole BitTorrent est un protocole peer-to-peer permettant le partage de fichiers de manière distribuée. Ce client implémente l'intégralité des spécifications du protocole BitTorrent v1.

### 1. Structure d'un fichier Torrent

Un fichier `.torrent` est encodé en **Bencode** et contient les métadonnées essentielles :

```
{
  "announce": "http://tracker.example.com:8080/announce",
  "announce-list": [["http://tracker1.com"], ["http://tracker2.com"]],
  "info": {
    "name": "example.txt",
    "piece length": 524288,
    "pieces": "<hash SHA-1 de chaque pièce concatenés>",
    "length": 1048576,  // Pour un fichier unique
    "files": [          // Pour plusieurs fichiers
      {"length": 524288, "path": ["dir", "file1.txt"]},
      {"length": 524288, "path": ["dir", "file2.txt"]}
    ]
  }
}
```

#### Champs importants :
- **announce** : URL du tracker principal
- **info** : Dictionnaire contenant les informations du fichier
- **piece length** : Taille de chaque pièce (généralement 256KB-2MB)
- **pieces** : Hash SHA-1 de chaque pièce (20 bytes par pièce)

### 2. Encodage Bencode

Le Bencode est le format d'encodage utilisé par BitTorrent :

#### Types de données :
- **Entiers** : `i<nombre>e` (ex: `i42e` = 42)
- **Chaînes** : `<longueur>:<chaîne>` (ex: `4:spam` = "spam")
- **Listes** : `l<éléments>e` (ex: `l4:spam4:eggse` = ["spam", "eggs"])
- **Dictionnaires** : `d<paires clé-valeur>e` (clés triées lexicographiquement)

### 3. Communication avec les Trackers

#### 3.1 Protocole HTTP Tracker

**Requête announce HTTP :**
```
GET /announce?info_hash=<hash>&peer_id=<id>&port=6881&uploaded=0&downloaded=0&left=1048576&compact=1
```

**Paramètres :**
- `info_hash` : Hash SHA-1 du dictionnaire "info" (URL-encoded)
- `peer_id` : Identifiant unique du client (20 bytes)
- `port` : Port d'écoute du client
- `uploaded/downloaded/left` : Statistiques de téléchargement
- `compact` : Format compact des peers (1 = activé)
- `event` : Événement ("started", "stopped", "completed")

**Réponse du tracker :**
```
{
  "interval": 1800,
  "peers": "<6 bytes par peer: 4 IP + 2 port>",
  "complete": 10,    // Nombre de seeders
  "incomplete": 5    // Nombre de leechers
}
```

#### 3.2 Protocole UDP Tracker

Le protocole UDP est plus efficace avec 3 étapes :

**1. Connect Request (16 bytes) :**
```
Offset  Size  Type     Description
0       8     uint64   Protocol ID (0x41727101980)
8       4     uint32   Action (0 = connect)
12      4     uint32   Transaction ID
```

**2. Connect Response (16 bytes) :**
```
Offset  Size  Type     Description
0       4     uint32   Action (0)
4       4     uint32   Transaction ID
8       8     uint64   Connection ID
```

**3. Announce Request (98 bytes) :**
```
Offset  Size  Type     Description
0       8     uint64   Connection ID
8       4     uint32   Action (1 = announce)
12      4     uint32   Transaction ID
16      20    bytes    Info hash
36      20    bytes    Peer ID
56      8     uint64   Downloaded
64      8     uint64   Left
72      8     uint64   Uploaded
80      4     uint32   Event
84      4     uint32   IP address
88      4     uint32   Key
92      4     int32    Num want
96      2     uint16   Port
```

### 4. Protocole Peer-to-Peer

#### 4.1 Handshake

Le handshake établit la connexion entre deux peers :

```
<pstrlen><pstr><reserved><info_hash><peer_id>

- pstrlen: 1 byte = 19
- pstr: 19 bytes = "BitTorrent protocol"
- reserved: 8 bytes (flags d'extension)
- info_hash: 20 bytes (hash SHA-1 du torrent)
- peer_id: 20 bytes (identifiant du peer)

Total: 68 bytes
```

#### 4.2 Messages du protocole

Tous les messages suivent ce format :
```
<length><type><payload>

- length: 4 bytes (big-endian)
- type: 1 byte
- payload: données variables
```

#### Types de messages :

**Keep-alive :**
```
<0000> (length = 0, pas de type ni payload)
```

**Choke (0) :**
```
<0001><0>
```

**Unchoke (1) :**
```
<0001><1>
```

**Interested (2) :**
```
<0001><2>
```

**Not Interested (3) :**
```
<0001><3>
```

**Have (4) :**
```
<0005><4><piece index>
- piece index: 4 bytes (index de la pièce possédée)
```

**Bitfield (5) :**
```
<0001+X><5><bitfield>
- bitfield: X bytes (1 bit par pièce, 1 = possédée)
```

**Request (6) :**
```
<0013><6><index><begin><length>
- index: 4 bytes (index de la pièce)
- begin: 4 bytes (offset dans la pièce)
- length: 4 bytes (longueur demandée, max 16KB)
```

**Piece (7) :**
```
<0009+X><7><index><begin><block>
- index: 4 bytes
- begin: 4 bytes
- block: X bytes (données de la pièce)
```

**Cancel (8) :**
```
<0013><8><index><begin><length>
(même format que Request)
```

### 5. Algorithmes de téléchargement

#### 5.1 Gestion des pièces

1. **Validation des pièces** : Chaque pièce téléchargée est vérifiée avec son hash SHA-1
2. **Découpage en blocs** : Les pièces sont découpées en blocs de 16KB maximum
3. **Parallélisation** : Jusqu'à 32 requêtes simultanées par peer

#### 5.2 Stratégies de sélection des pièces

**Sequential Selector :**
- Télécharge les pièces dans l'ordre séquentiel
- Optimal pour le streaming ou la visualisation progressive

**Random Selector :**
- Sélection aléatoire des pièces disponibles
- Améliore la diversification du réseau

**Peer-Optimized Selector :**
- Priorise les pièces disponibles chez le plus de peers
- Équilibre entre rareté et disponibilité

#### 5.3 Algorithme de choking

Le choking contrôle la bande passante :

1. **Interested/Not Interested** : Indique l'intérêt pour les pièces du peer
2. **Choke/Unchoke** : Autorise ou bloque l'upload vers un peer
3. **Optimistic Unchoke** : Unchoke périodique d'un peer aléatoire
4. **Réciprocité** : Favorise les peers qui uploadent en retour

### 6. Gestion des erreurs et timeouts

#### Timeouts configurés :
- **Connexion TCP** : 30 secondes
- **Handshake** : 15 secondes
- **Messages** : 30 secondes
- **Requêtes de pièces** : 30 secondes

#### Récupération d'erreurs :
- Reconnexion automatique en cas de déconnexion
- Retry des requêtes échouées
- Basculement vers d'autres trackers

### 7. Optimisations implémentées

#### Réseau :
- Pool de connexions réutilisables
- Limitation du nombre de connexions simultanées
- Détection et évitement des peers lents

#### Stockage :
- Écriture asynchrone des pièces
- Vérification d'intégrité en arrière-plan
- Support des torrents multi-fichiers

#### Mémoire :
- Bufferisation intelligente des pièces
- Libération automatique de la mémoire
- Limitation de la taille des caches

## Structure du code

### Models (Logique métier)

- **BitTorrent** : Orchestrateur principal coordonnant tous les composants
- **PeerManager** : Gestion du pool de connexions peers
- **PieceManager** : Gestion des pièces, blocs et validation
- **TrackerManager** : Communication multi-trackers avec failover

### Utils (Fonctions utilitaires)

- **Protocol** : Implémentation du protocole BitTorrent
- **Storage** : Gestion des fichiers et du stockage
- **Torrent** : Parsing et validation des fichiers torrents
- **Tracker** : Communication avec les trackers

### Types (Définitions TypeScript)

Organisation modulaire des types avec suffixe `.type.ts` pour une meilleure lisibilité et maintenance.

## Tests

```bash
# Exécuter tous les tests
bun test

# Tests avec coverage
bun test --coverage

# Tests spécifiques
bun test bencode
bun test metadata
```

### Tests implémentés :
- **Bencode** : Encodage/décodage complet
- **Metadata** : Extraction des métadonnées torrents
- **Validation** : Validation des fichiers torrents
