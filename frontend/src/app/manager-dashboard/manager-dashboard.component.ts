import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../auth.service';
import { environment } from 'src/environments/environment';

declare const Swal: any;

@Component({
  selector: 'app-manager-dashboard',
  templateUrl: './manager-dashboard.component.html',
  styleUrls: ['./manager-dashboard.component.scss']
})
export class ManagerDashboardComponent implements OnInit {
  teamErrors: any[] = [];
  assignedTrainings: any[] = [];
  isLoadingErrors: boolean = false;
  isLoadingTrainings: boolean = false;
  isAssigning: boolean = false;
  currentTab: 'errors' | 'assigned' = 'errors';

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }

  ngOnInit(): void {
    this.fetchTeamErrors();
    this.fetchAssignedTrainings();
  }

  get managerId(): string {
    return this.authService.getLoggedInUser() || '';
  }

  fetchTeamErrors() {
    if (!this.managerId) return;
    this.isLoadingErrors = true;
    this.http.get<any[]>(`${environment.apiUrl}/api/manager/team-errors?manager_id=${this.managerId}`).subscribe(
      (data) => {
        this.teamErrors = data;
        this.isLoadingErrors = false;
      },
      (error) => {
        console.error('Error fetching team errors', error);
        this.isLoadingErrors = false;
      }
    );
  }

  fetchAssignedTrainings() {
    if (!this.managerId) return;
    this.isLoadingTrainings = true;
    this.http.get<any[]>(`${environment.apiUrl}/api/manager/assigned-trainings?manager_id=${this.managerId}`).subscribe(
      (data) => {
        this.assignedTrainings = data;
        this.isLoadingTrainings = false;
      },
      (error) => {
        console.error('Error fetching assigned trainings', error);
        this.isLoadingTrainings = false;
      }
    );
  }

  assignTraining(error: any) {
    if (this.isAssigning) return;
    if (error.recommended_training === 'No training mapped') {
      Swal.fire('Info', 'No training mapped for this error code yet.', 'info');
      return;
    }

    Swal.fire({
      title: 'Confirm Assignment',
      text: `Assign "${error.recommended_training}" to ${error.emp_name}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Assign'
    }).then((result: any) => {
      if (result.isConfirmed) {
        this.isAssigning = true;
        const payload = {
          manager_id: this.managerId,
          emp_id: error.emp_id,
          error_code: error.error_code,
          training_name: error.recommended_training
        };

        this.http.post(`${environment.apiUrl}/api/manager/assign-training`, payload).subscribe(
          (res: any) => {
            this.isAssigning = false;
            Swal.fire('Assigned!', res.message, 'success');
            this.fetchAssignedTrainings();
          },
          (err) => {
            this.isAssigning = false;
            const msg = err.error?.error || 'Failed to assign training';
            Swal.fire('Error', msg, 'error');
          }
        );
      }
    });
  }

  setTab(tab: 'errors' | 'assigned') {
    this.currentTab = tab;
  }
}
