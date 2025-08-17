import { PeerConnection } from '~/models/peer/peer-connection';
import type { Peer } from '~/types';
import type { HandshakeMessage, PeerMessage } from '~/types/peer-messages';
import { log } from '~/utils/system/logging';
import { createMessageHandler } from './message-parser';

export function createPeerConnection(
  peer: Peer,
  onHandshake: (handshake: HandshakeMessage) => void,
  onMessage: (message: PeerMessage) => void
) {
  const messageHandler = createMessageHandler(onHandshake, onMessage);

  const peerConnection = new PeerConnection(peer.ip, peer.port, messageHandler, (error: Error) =>
    log('fail', `${error.message} (${peer.ip}:${peer.port})`)
  );

  return peerConnection;
}
