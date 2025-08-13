declare module 'bun' {
  interface Env {
    NODE_ENV?: string;
    TZ?: string;
    TORRENT_FILE_PATH?: string;
  }
}
