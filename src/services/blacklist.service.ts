// Simple in-memory token blacklist service
interface BlacklistedToken {
  token: string;
  expiresAt: number; // timestamp in milliseconds
}

class TokenBlacklistService {
  private blacklist = new Map<string, number>();

  /**
   * Add a token to the blacklist with an expiry time.
   */
  blacklistToken(token: string, expiresAtSeconds: number): void {
    // Convert exp claim (seconds since epoch) to milliseconds
    const expiresAtMs = expiresAtSeconds * 1000;
    this.blacklist.set(token, expiresAtMs);
  }

  /**
   * Check if a token has been blacklisted.
   */
  isTokenBlacklisted(token: string): boolean {
    const expiresAt = this.blacklist.get(token);
    if (!expiresAt) {
      return false;
    }

    // If token has expired naturally, remove it from the blacklist map
    if (Date.now() > expiresAt) {
      this.blacklist.delete(token);
      return false;
    }

    return true;
  }

  /**
   * Run cleanup of expired tokens from the blacklist.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [token, expiresAt] of this.blacklist.entries()) {
      if (now > expiresAt) {
        this.blacklist.delete(token);
      }
    }
  }
}

export const blacklistService = new TokenBlacklistService();

// Run cleanup every hour
setInterval(() => {
  blacklistService.cleanup();
}, 60 * 60 * 1000).unref();
