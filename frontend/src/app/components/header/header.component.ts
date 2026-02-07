import { Component, OnInit, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/auth.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit {
  loggedInUser: string | null = null;
  showDropdown = false;
  userRole: 'HR' | 'Employee' | undefined;

  constructor(private router: Router, public authService: AuthService) {}

  ngOnInit() {
    // Populate UI state from session
    this.loggedInUser = this.authService.getLoggedInUser();
    this.userRole = this.authService.getAccessType();

    // Optional: if already logged in and you want to land users on their default page
    // (comment out if you have your own landing logic elsewhere)
    // if (this.authService.isLoggedIn()) {
    //   this.router.navigate([this.userRole === 'HR' ? '/reports' : '/uploads']);
    // }
  }

  navigateToAdmin() {
    this.router.navigate(['/admin-login']);
  }

  logout() {
    this.authService.logout();
    this.loggedInUser = null;
    this.userRole = undefined;
    this.router.navigate(['/admin-login']);
    this.showDropdown = false;
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

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.profile')) {
      this.showDropdown = false;
    }
  }
}
