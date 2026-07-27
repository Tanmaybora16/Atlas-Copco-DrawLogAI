import { Component, OnInit, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from 'src/app/auth.service';
import { environment } from 'src/environments/environment';

declare const Swal: any;

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit {
  loggedInUser: string | null = null;
  showDropdown = false;
  userRole: 'HR' | 'Employee' | undefined;

  // Support Modal State
  showSupportModal = false;
  isSubmittingSupport = false;
  supportData = {
    name: '',
    emp_id: '',
    team: '',
    message: ''
  };

  private readonly API = `${environment.apiUrl}`;

  constructor(
    private router: Router,
    public authService: AuthService,
    private http: HttpClient
  ) {}

  ngOnInit() {
    // Populate UI state from session
    this.loggedInUser = this.authService.getLoggedInUser();
    this.userRole = this.authService.getAccessType();
  }

  navigateToAdmin() {
    this.router.navigate(['/admin-login']);
  }

  logout() {
    this.authService.logout();
    this.loggedInUser = null;
    this.userRole = undefined;
    this.showDropdown = false;
    this.router.navigate(['/admin-login']).then(() => {
      window.location.reload();
    });
  }

  isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  toggleProfileDropdown() {
    this.showDropdown = !this.showDropdown;
  }

  changePassword() {
    this.router.navigate(['/change-password']);
    this.showDropdown = false;
  }

  // --- Support Modal Handler ---
  openSupportModal() {
    this.showSupportModal = true;
    this.showDropdown = false;
    
    // Auto-populate user details from auth session if available
    const empId = this.authService.getLoggedInUser() || '';
    const fullName = this.authService.getLoggedInUserFullName() || '';
    
    this.supportData.emp_id = empId;
    this.supportData.name = fullName;

    // Fetch team info if available
    if (empId) {
      this.http.get<any[]>(`${this.API}/api/users`).subscribe({
        next: (users) => {
          if (Array.isArray(users)) {
            const matched = users.find(u => u.emp_id === empId || u.name === empId);
            if (matched) {
              if (matched.team) this.supportData.team = matched.team;
              if (matched.name) this.supportData.name = matched.name;
            }
          }
        },
        error: (err) => console.warn('Could not auto-fetch user details for support:', err)
      });
    }
  }

  closeSupportModal() {
    this.showSupportModal = false;
  }

  submitSupport() {
    if (!this.supportData.name.trim() || !this.supportData.emp_id.trim() || !this.supportData.message.trim()) {
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'warning',
          title: 'Missing Required Fields',
          text: 'Please fill in Name, Emp ID, and Message before submitting.'
        });
      } else {
        alert('Please fill in Name, Emp ID, and Message before submitting.');
      }
      return;
    }

    this.isSubmittingSupport = true;
    this.http.post(`${this.API}/api/support`, this.supportData).subscribe({
      next: (res: any) => {
        this.isSubmittingSupport = false;
        this.showSupportModal = false;
        this.supportData.message = '';

        if (typeof Swal !== 'undefined') {
          Swal.fire({
            icon: 'success',
            title: 'Submitted!',
            text: res?.message || 'Your support request has been submitted successfully.',
            timer: 2500,
            showConfirmButton: false
          });
        } else {
          alert(res?.message || 'Support request submitted successfully!');
        }
      },
      error: (err) => {
        this.isSubmittingSupport = false;
        const msg = err?.error?.error || 'Failed to submit support request. Please try again.';
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            icon: 'error',
            title: 'Submission Failed',
            text: msg
          });
        } else {
          alert(msg);
        }
      }
    });
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.profile')) {
      this.showDropdown = false;
    }
  }
}
