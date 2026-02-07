import { Component } from '@angular/core';
import { NgForm } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../auth.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-change-password',
  templateUrl: './change-password.component.html',
  styleUrls: ['./change-password.component.scss']
})
export class ChangePasswordComponent {
  private API = `${environment.apiUrl}`;

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  successMessage = '';
  errorMessage = '';

  currentPasswordVisible = false;
  newPasswordVisible = false;
  confirmPasswordVisible = false;

  isBusy = false; // in-flight guard

  constructor(
    private http: HttpClient,
    private router: Router,
    private auth: AuthService
  ) {}

  togglePasswordVisibility(which: 'current' | 'new' | 'confirm') {
    if (this.isBusy) return; // block toggles during request
    if (which === 'current') this.currentPasswordVisible = !this.currentPasswordVisible;
    if (which === 'new') this.newPasswordVisible = !this.newPasswordVisible;
    if (which === 'confirm') this.confirmPasswordVisible = !this.confirmPasswordVisible;
  }

  onSubmit(form: NgForm) {
    if (this.isBusy) return; // prevent double submit
    this.clearMessages();

    if (!form.valid) {
      this.errorMessage = 'Please fill all password fields.';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.errorMessage = 'Passwords do not match.';
      return;
    }

    // Client-side password policy (server enforces too)
    const policy = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*_+\-=?])[A-Za-z\d!@#$%^&*_+\-=?]{8,64}$/;
    if (!policy.test(this.newPassword)) {
      this.errorMessage =
        'Password must be 8-64 chars with upper, lower, number, and symbol (!@#$%^&*_+-=?).';
      return;
    }

    const empId = this.auth.getLoggedInUser();
    if (!empId) {
      this.errorMessage = 'Session expired. Please log in again.';
      this.router.navigate(['/admin-login']);
      return;
    }

    this.isBusy = true;

    this.http.post<any>(`${this.API}/auth/change-password`, {
      emp_id: empId,
      current_password: this.currentPassword,
      new_password: this.newPassword,
      confirm_password: this.confirmPassword
    }).subscribe({
      next: (res) => {
        this.isBusy = false; // re-enable UI

        if (res?.success) {
          this.successMessage = res?.message || 'Password updated successfully.';
          // Optional: force re-login after change
          setTimeout(() => {
            this.auth.logout();
            this.router.navigate(['/admin-login']);
          }, 800);
        } else {
          this.errorMessage = res?.message || 'Failed to update password.';
        }
      },
      error: (err) => {
        this.isBusy = false; // re-enable on error too
        this.errorMessage = err?.error?.message || 'Failed to update password.';
      }
    });
  }

  private clearMessages() {
    this.successMessage = '';
    this.errorMessage = '';
  }
}
