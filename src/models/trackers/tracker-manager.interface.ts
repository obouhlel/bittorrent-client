import type { Peer, TrackerEvent, TrackerInfo, TrackerStats } from '~/types';
/**
 * Interface simplifiée du TrackerManager
 * Principe: Simple, efficace, maintenable
 */
export interface ITrackerManager {
  /**
   * Découvre les peers depuis tous les trackers en parallèle
   * À appeler au démarrage du téléchargement
   */
  discoverPeers(): Promise<Peer[]>;

  /**
   * Rafraîchit les peers depuis les meilleurs trackers
   * À appeler périodiquement ou quand on manque de peers
   */
  refreshPeers(): Promise<Peer[]>;

  /**
   * Démarre le refresh automatique avec un intervalle donné
   * Par défaut: 60 secondes
   */
  startAutoRefresh(): void;

  /**
   * Arrête le refresh automatique
   */
  stopAutoRefresh(): void;

  /**
   * Met à jour les stats de téléchargement
   * Ces infos sont envoyées aux trackers
   */
  updateStats(stats: TrackerStats): void;

  /**
   * Annonce un événement spécial aux trackers
   * - 'stopped': Arrêt du téléchargement
   * - 'completed': Téléchargement terminé
   */
  announceEvent(event: TrackerEvent): Promise<void>;

  /**
   * Retourne la liste des trackers avec leur état
   */
  getTrackersStatus(): TrackerInfo[];

  /**
   * Retourne le nombre total de peers uniques découverts
   */
  getTotalPeersCount(): number;

  /**
   * Nettoie les ressources (ferme les connexions UDP)
   */
  destroy(): Promise<void>;
}
