import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../auth.service';
import { environment } from 'src/environments/environment';

declare const Swal: any;

@Component({
  selector: 'app-admin-login',
  templateUrl: './admin-login.component.html',
  styleUrls: ['./admin-login.component.scss']
})
export class AdminLoginComponent {

  passwordVisible = false;
  UserName: string = '';
  password: string = '';
  isBusy: boolean = false;  // ⬅️ in-flight guard

  private apiUrl = `${environment.apiUrl}/admin-login`;

  constructor(
    private authService: AuthService,
    private http: HttpClient,
    private router: Router
  ) {}

  togglePasswordVisibility() {
    if (this.isBusy) return;              // ignore clicks during request
    this.passwordVisible = !this.passwordVisible;
  }

  onSubmit(form: any) {
    if (this.isBusy) return;              // block double submit
    if (!form.valid) {
      Swal.fire({
        title: 'Invalid Form',
        text: 'Please enter both username and password.',
        icon: 'warning',
        confirmButtonText: 'OK'
      });
      return;
    }

    this.isBusy = true;                   // ⬅️ disable UI

    const payload = { username: this.UserName.trim(), password: this.password };

    this.http.post<any>(this.apiUrl, payload).subscribe(
      (response) => {
        this.isBusy = false;              // ⬅️ re-enable on response

        // Expected: { success:true, status:"OK", access_type:"HR"|"Employee", message?:string }
        if (!response || response.success !== true || response.status !== 'OK') {
          Swal.fire({
            title: 'Login Failed',
            text: response?.message || 'Invalid credentials',
            icon: 'error',
            confirmButtonText: 'Try Again'
          });
          return;
        }

        // Save session (username + role)
        this.authService.login(this.UserName.trim(), response.access_type);

        // Route by role (HR → /employee, Employee → /uploads)
        const targetRoute = response.access_type === 'HR' ? '/employee' : '/submission';

        Swal.fire({
          title: 'Success!',
          text: response.message || 'Login Successful',
          icon: 'success',
          confirmButtonText: 'OK'
        }).then(() => {
          this.router.navigate([targetRoute]).then(() => {
            // keep your existing behavior
            window.location.reload();
          });
        });
      },
      () => {
        this.isBusy = false;              // ⬅️ re-enable on error too
        Swal.fire({
          title: 'Error',
          text: 'Something went wrong. Please try again.',
          icon: 'error',
          confirmButtonText: 'OK'
        });
      }
    );
  }

  onForgotPassword(event: Event) {
    event.preventDefault();
    if (this.isBusy) return;              // prevent leaving mid-request
    this.router.navigate(['/forgot-password']);
  }
}
