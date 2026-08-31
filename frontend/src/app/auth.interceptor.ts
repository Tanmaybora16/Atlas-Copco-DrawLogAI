import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { Router } from '@angular/router';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  constructor(private authService: AuthService, private router: Router) { }

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    // Allow public endpoints (login, forgot password)
    if (!request.url.includes('/admin-login') && !request.url.includes('/auth/forgot-password')) {
      if (!this.authService.isLoggedIn()) {
        // isLoggedIn() already clears the session if it's expired
        this.router.navigate(['/admin-login']).then(() => {
          window.location.reload();
        });
        // Cancel the request
        return throwError(() => new Error('Session Expired'));
      }

      // Optional: refresh session window on every request
      // this.authService.refreshSessionWindow();
    }

    return next.handle(request);
  }
}
