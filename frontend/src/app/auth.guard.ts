import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | UrlTree {
    if (!this.auth.isLoggedIn()) {
      // Not logged in → go to login
      return this.router.parseUrl('/admin-login');
    }

    const allowed = route.data['roles'] as Array<'HR' | 'Employee'> | undefined;
    const userRole = this.auth.getAccessType();

    // If route specifies roles, enforce them
    if (allowed && (!userRole || !allowed.includes(userRole))) {
      // Redirect to a safe page the user can access
      return this.router.parseUrl(userRole === 'HR' ? '/reports' : '/uploads');
    }

    return true;
  }
}
