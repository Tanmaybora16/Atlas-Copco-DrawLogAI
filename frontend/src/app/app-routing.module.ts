import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UploadsComponent } from './uploads/uploads.component';
import { ReportsComponent } from './reports/reports.component';
import { AdminLoginComponent } from './admin-login/admin-login.component';
import { EmployeeComponent } from './employee/employee.component';
import { AuthGuard } from './auth.guard';
import { ChangePasswordComponent } from './components/change-password/change-password.component';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password.component';
import { RequestsComponent } from './requests/requests.component';
import { SubmissionComponent } from './submission/submission.component';
import { CanvasComponent } from './canvas/canvas.component';
import { StructureComponent } from './structure/structure.component';
import { CadqConfigComponent } from './cadq-config/cadq-config.component';
import { ManagerDashboardComponent } from './manager-dashboard/manager-dashboard.component';

const routes: Routes = [
  // Redirect root to explicit login route
  { path: '', redirectTo: 'admin-login', pathMatch: 'full' },

  // Login (public)
  { path: 'admin-login', component: AdminLoginComponent },

  // Reports – accessible to HR, Employee, and Manager
  { path: 'reports', component: ReportsComponent, canActivate: [AuthGuard], data: { roles: ['HR', 'Employee', 'Manager'] } },

  // Uploads – Employee and Manager
  { path: 'uploads', component: UploadsComponent, canActivate: [AuthGuard], data: { roles: ['Employee', 'Manager'] } },

  // Change password – must be logged in
  { path: 'change-password', component: ChangePasswordComponent, canActivate: [AuthGuard], data: { roles: ['HR', 'Employee', 'Manager'] } },
  {
    path: 'submission', component: SubmissionComponent, canActivate: [AuthGuard], data: { roles: ['Employee', 'Manager'] }
  },
  {
    path: 'requests', component: RequestsComponent, canActivate: [AuthGuard], data: { roles: ['Employee', 'Manager'] }
  },
  // Forgot password – public
  { path: 'forgot-password', component: ForgotPasswordComponent },

  // Employee page – HR only
  { path: 'employee', component: EmployeeComponent, canActivate: [AuthGuard], data: { roles: ['HR'] } },
  { path: 'structure', component: StructureComponent, canActivate: [AuthGuard], data: { roles: ['HR'] } },
  { path: 'cadq-config', component: CadqConfigComponent, canActivate: [AuthGuard], data: { roles: ['HR'] } },
  { path: 'canvas', component: CanvasComponent, canActivate: [AuthGuard], data: { roles: ['Employee', 'Manager'] } },

  // Manager tab - Manager only
  { path: 'manager-dashboard', component: ManagerDashboardComponent, canActivate: [AuthGuard], data: { roles: ['Manager'] } },

  // Fallback
  { path: '**', redirectTo: 'admin-login' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
