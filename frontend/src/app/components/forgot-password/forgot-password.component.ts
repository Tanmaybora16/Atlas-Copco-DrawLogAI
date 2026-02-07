import { Component, OnDestroy } from '@angular/core';
import { NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss']
})
export class ForgotPasswordComponent implements OnDestroy {
  private readonly API = `${environment.apiUrl}`;

  step = 1;

  empId = '';
  email = '';
  otp: string[] = ['', '', '', ''];
  newPassword = '';
  confirmPassword = '';

  successMessage = '';
  errorMessage = '';

  newPasswordVisible = false;
  confirmPasswordVisible = false;

  minutes = '05';
  seconds = 0;
  private timerHandle: any = null;
  isOtpExpired = false;

  isResending = false;
  isBusy = false;             // <-- global in-flight guard

  constructor(private router: Router, private http: HttpClient) {}
  ngOnDestroy(): void { this.clearTimer(); }

  // ===== UI helpers =====
  togglePasswordVisibility(field: 'new' | 'confirm') {
    if (this.isBusy) return;  // block toggles during calls
    if (field === 'new') this.newPasswordVisible = !this.newPasswordVisible;
    if (field === 'confirm') this.confirmPasswordVisible = !this.confirmPasswordVisible;
  }

  isOtpComplete(): boolean {
    return this.otp.every(d => d && d.trim() !== '');
  }

  onOtpInput(event: any, index: number) {
    if (this.isBusy) return;
    const input: HTMLInputElement = event.target as HTMLInputElement;
    input.value = input.value.replace(/\D/g, '');
    this.otp[index] = input.value;

    if (input.value.length === 1 && index < 3) {
      const nextInput = input.nextElementSibling as HTMLInputElement;
      if (nextInput) { nextInput.focus(); }
    }
  }

  onOtpKeyDown(event: KeyboardEvent, index: number) {
    if (this.isBusy) return;
    const input = event.target as HTMLInputElement;
    if (event.key === 'Backspace' && input.value === '' && index > 0) {
      const prevInput = input.previousElementSibling as HTMLInputElement;
      if (prevInput) { prevInput.focus(); }
    }
  }

  private apiErrorToMessage(err: any, fallback: string): string {
    return err?.error?.message || err?.error?.error || fallback;
  }

  // ===== Step actions =====
  sendOtp() {
    if (this.isBusy) return;            // prevent double click
    this.clearMessages();
    if (!this.empId || !this.email) {
      this.errorMessage = 'Please enter both Emp_ID and Email.';
      return;
    }

    this.isBusy = true;
    this.http.post<any>(`${this.API}/auth/forgot-password/initiate`, {
      emp_id: this.empId.trim(),
      email: this.email.trim()
    }).subscribe({
      next: (res) => {
        if (res?.success) {
          this.successMessage = res?.message || 'OTP sent to your registered email.';
          this.step = 2;
          this.startTimer(5 * 60); // 5 minutes
        } else {
          this.errorMessage = res?.message || 'Failed to send OTP.';
        }
        this.isBusy = false;
      },
      error: (err) => {
        this.errorMessage = this.apiErrorToMessage(err, 'Failed to send OTP.');
        this.isBusy = false;
      }
    });
  }

  resendOtp() {
    if (this.isBusy || this.isResending) return;  // prevent spam
    this.clearMessages();

    if (this.step !== 2) {
      this.errorMessage = 'You can only resend OTP on the verification step.';
      return;
    }

    this.isResending = true;
    this.http.post<any>(`${this.API}/auth/forgot-password/initiate`, {
      emp_id: this.empId.trim(),
      email: this.email.trim()
    }).subscribe({
      next: (res) => {
        if (res?.success) {
          this.successMessage = res?.message || 'A new OTP has been sent to your email.';
          this.restartTimer();
        } else {
          this.errorMessage = res?.message || 'Failed to resend OTP.';
        }
        this.isResending = false;
      },
      error: (err) => {
        this.errorMessage = this.apiErrorToMessage(err, 'Failed to resend OTP.');
        this.isResending = false;
      }
    });
  }

  onSubmitOtp() {
    if (this.isBusy) return;            // block double submit
    this.clearMessages();

    if (this.isOtpExpired) {
      this.errorMessage = 'OTP expired. Please resend a new OTP.';
      return;
    }
    const enteredOtp = this.otp.join('');
    if (!/^\d{4}$/.test(enteredOtp)) {
      this.errorMessage = 'Please enter a 4-digit OTP.';
      return;
    }

    this.isBusy = true;
    this.http.post<any>(`${this.API}/auth/forgot-password/verify`, {
      emp_id: this.empId.trim(),
      otp: enteredOtp
    }).subscribe({
      next: (res) => {
        if (res?.success) {
          this.successMessage = res?.message || 'OTP verified successfully';
          setTimeout(() => {
            this.step = 3;
            this.clearTimer();
          }, 500);
        } else {
          this.errorMessage = res?.message || 'Invalid OTP. Please try again.';
        }
        this.isBusy = false;
      },
      error: (err) => {
        this.errorMessage = this.apiErrorToMessage(err, 'Failed to verify OTP.');
        this.isBusy = false;
      }
    });
  }

  onSubmit(form: NgForm) {
    if (this.isBusy) return;           // block double submit
    this.clearMessages();
    if (this.step !== 3) return;

    if (!this.newPassword || !this.confirmPassword) {
      this.errorMessage = 'Please fill in all password fields';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.errorMessage = 'Passwords do not match';
      return;
    }

    const enteredOtp = this.otp.join('');
    if (!/^\d{4}$/.test(enteredOtp)) {
      this.errorMessage = 'Invalid OTP. Please restart the flow.';
      return;
    }

    const policy = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*_+\-=?])[A-Za-z\d!@#$%^&*_+\-=?]{8,64}$/;
    if (!policy.test(this.newPassword)) {
      this.errorMessage = 'Password must be 8-64 chars with upper, lower, number, and symbol (!@#$%^&*_+-=?)';
      return;
    }

    this.isBusy = true;
    this.http.post<any>(`${this.API}/auth/forgot-password/reset`, {
      emp_id: this.empId.trim(),
      otp: enteredOtp,
      new_password: this.newPassword,
      confirm_password: this.confirmPassword
    }).subscribe({
      next: (res) => {
        if (res?.success) {
          this.successMessage = res?.message || 'Password changed successfully!';
          setTimeout(() => {
            this.router.navigate(['/admin-login']);
          }, 800);
        } else {
          this.errorMessage = res?.message || 'Failed to change password.';
        }
        this.isBusy = false;
      },
      error: (err) => {
        this.errorMessage = this.apiErrorToMessage(err, 'Failed to change password.');
        this.isBusy = false;
      }
    });
  }

  // ===== Timer helpers =====
  private startTimer(totalSeconds: number) {
    this.isOtpExpired = false;
    this.seconds = totalSeconds % 60;
    this.minutes = this.pad(Math.floor(totalSeconds / 60));
    this.clearTimer();

    this.timerHandle = setInterval(() => {
      if (this.seconds === 0) {
        const mins = parseInt(this.minutes, 10);
        if (mins === 0) {
          this.isOtpExpired = true;
          this.clearTimer();
          return;
        }
        this.minutes = this.pad(mins - 1);
        this.seconds = 59;
      } else {
        this.seconds--;
      }
    }, 1000);
  }

  private restartTimer() { this.startTimer(5 * 60); }

  private clearTimer() {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private pad(n: number): string { return n < 10 ? '0' + n : '' + n; }

  private clearMessages() {
    this.successMessage = '';
    this.errorMessage = '';
  }
}
