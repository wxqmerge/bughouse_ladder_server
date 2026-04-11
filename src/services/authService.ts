/**
 * Authentication Service - Manages user authentication and JWT tokens
 */

export interface AuthToken {
  token: string;
  expiresIn: number; // milliseconds until expiration
  expiresAt: Date;
}

export interface UserInfo {
  id: string;
  username: string;
  role: 'user' | 'admin';
}

class AuthService {
  private static readonly TOKEN_KEY = 'ladder_auth_token';
  private token: AuthToken | null = null;
  private userInfo: UserInfo | null = null;
  private listeners: Set<(hasToken: boolean) => void> = new Set();

  constructor() {
    // Load existing token from sessionStorage on init
    this.loadFromStorage();
  }

  /**
   * Subscribe to authentication state changes
   */
  subscribe(listener: (hasToken: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify listeners of auth state change
   */
  private notifyListeners(): void {
    const hasToken = !!this.token;
    this.listeners.forEach(l => l(hasToken));
  }

  /**
   * Load token from sessionStorage
   */
  private loadFromStorage(): void {
    const stored = sessionStorage.getItem(AuthService.TOKEN_KEY);
    if (stored) {
      try {
        const data: { token: string; expiresAt: string } = JSON.parse(stored);
        const expiresAt = new Date(data.expiresAt);
        
        if (expiresAt > new Date()) {
          this.token = {
            token: data.token,
            expiresIn: expiresAt.getTime() - Date.now(),
            expiresAt,
          };
          this.notifyListeners();
        }
      } catch (error) {
        console.error('Failed to parse stored auth token:', error);
        sessionStorage.removeItem(AuthService.TOKEN_KEY);
      }
    }
  }

  /**
   * Save token to sessionStorage
   */
  private saveToStorage(): void {
    if (this.token) {
      sessionStorage.setItem(
        AuthService.TOKEN_KEY,
        JSON.stringify({
          token: this.token.token,
          expiresAt: this.token.expiresAt.toISOString(),
        })
      );
    }
  }

  /**
   * Login with username and password
   */
  async login(username: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        return { 
          success: false, 
          error: data.error?.message || 'Login failed. Check your credentials.' 
        };
      }

      // Store token
      const { token, user } = data.data;
      this.token = {
        token,
        expiresIn: 24 * 60 * 60 * 1000, // 24 hours (as set by server)
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      this.userInfo = user;
      
      this.saveToStorage();
      this.notifyListeners();

      return { success: true };
    } catch (error: any) {
      return { success: false, error: 'Network error. Is the server running?' };
    }
  }

  /**
   * Logout - clear token
   */
  logout(): void {
    this.token = null;
    this.userInfo = null;
    sessionStorage.removeItem(AuthService.TOKEN_KEY);
    this.notifyListeners();
  }

  /**
   * Get current auth token
   */
  getToken(): string | null {
    // Check if token is expired
    if (this.token && this.token.expiresIn <= 0) {
      this.logout();
      return null;
    }
    return this.token?.token || null;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.token;
  }

  /**
   * Get current user info
   */
  getUserInfo(): UserInfo | null {
    return this.userInfo;
  }

  /**
   * Get auth headers for API requests
   */
  getAuthHeaders(): Record<string, string> {
    const token = this.getToken();
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
    return {};
  }
}

// Export singleton instance
export const authService = new AuthService();
