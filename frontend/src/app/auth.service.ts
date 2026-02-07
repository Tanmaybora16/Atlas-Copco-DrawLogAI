import { Injectable } from '@angular/core';

type AccessType = 'HR' | 'Employee';

interface SessionState {
  username: string;
  accessType?: AccessType;
  loginTime: number; // epoch ms
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Use sessionStorage so the session dies when the tab/window closes.
  private readonly KEY = 'session';
  // Hard session cap: 1 hour
  private readonly SESSION_MAX_AGE_MS = 60 * 60 * 1000;

  /** Call this after a successful login */
  login(username: string, accessType?: AccessType): void {
    const state: SessionState = {
      username: username.trim(),
      accessType,
      loginTime: Date.now()
    };
    sessionStorage.setItem(this.KEY, JSON.stringify(state));
  }

  /** Remove session immediately */
  logout(): void {
    sessionStorage.removeItem(this.KEY);
  }

  /** Is there a valid (non-expired) session right now? */
  isLoggedIn(): boolean {
    const state = this.getState();
    if (!state) return false;

    // Hard expiry check (since login time)
    const age = Date.now() - state.loginTime;
    if (age > this.SESSION_MAX_AGE_MS) {
      this.logout();
      return false;
    }
    return true;
  }

  /** Username of the current session (or null) */
  getLoggedInUser(): string | null {
    const s = this.getState();
    return s?.username ?? null;
  }

  /** Access type (HR | Employee) of the current session (or undefined) */
  getAccessType(): AccessType | undefined {
    const s = this.getState();
    return s?.accessType as AccessType | undefined;
  }

  /** Optionally refresh the 1-hour window (call on activity if you want rolling sessions) */
  refreshSessionWindow(): void {
    const s = this.getState();
    if (!s) return;
    // If you want a rolling (idle-based) session, uncomment:
    // s.loginTime = Date.now();
    // sessionStorage.setItem(this.KEY, JSON.stringify(s));
  }

  /** Read + validate the session object */
  private getState(): SessionState | null {
    try {
      const raw = sessionStorage.getItem(this.KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SessionState;

      // basic shape checks
      if (!parsed || typeof parsed.username !== 'string' || typeof parsed.loginTime !== 'number') {
        sessionStorage.removeItem(this.KEY);
        return null;
      }
      return parsed;
    } catch {
      sessionStorage.removeItem(this.KEY);
      return null;
    }
  }
}
