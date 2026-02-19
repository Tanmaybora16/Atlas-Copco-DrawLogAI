import { Component, OnInit, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-employee',
  templateUrl: './employee.component.html',
  styleUrls: ['./employee.component.scss']
})
export class EmployeeComponent implements OnInit {
  divisions: any[] = [];
  allPCs: any[] = []; // Store all PCs
  pcs: any[] = [];    // Filtered PCs
  teams: any[] = [];

  employees: any[] = [];
  employeeId: string = '';
  employeeName: string = '';
  employeeEmail: string = '';
  selectedDivision: string = '';
  selectedPC: string = '';
  selectedTeam: string = '';
  editingIndex: number | null = null;
  selectedPCs: string[] = [];
  dropdownOpen = false;

  isBusy = false;

  constructor(private http: HttpClient) { }

  ngOnInit() {
    this.fetchInitialData();
    this.fetchEmployees();
  }

  fetchInitialData() {
    this.http.get<any[]>(`${environment.apiUrl}/api/structure/divisions`).subscribe(data => this.divisions = data);
    this.http.get<any[]>(`${environment.apiUrl}/api/structure/pcs`).subscribe(data => this.allPCs = data);
    this.http.get<any[]>(`${environment.apiUrl}/api/structure/teams`).subscribe(data => this.teams = data);
  }

  fetchEmployees() {
    if (this.isBusy) return;
    this.isBusy = true;
    this.http
      .get<any[]>(`${environment.apiUrl}/fetch-all-employees`)
      .subscribe(
        (data) => {
          this.employees = data.map((emp) => ({
            id: emp.Emp_ID,
            name: emp.Emp_Name,
            email: emp.Emp_Email,
            division: emp.Emp_Division,
            pc: emp.Emp_PC,
            team: emp.Emp_Team,
          }));
          this.isBusy = false;
        },
        (error) => {
          this.isBusy = false;
          const errMsg = error?.error?.error || 'Unable to fetch employees.';
          (window as any).Swal?.fire?.('Error', errMsg, 'error');
          console.error('Error fetching employees:', error);
        }
      );
  }

  onDivisionChange() {
    // Filter PCs based on selected Division Name
    // The backend PC object has division_id, but the current UI uses names.
    // We need to find the Division ID corresponding to the selectedDivision name.

    if (!this.selectedDivision) {
      this.pcs = [];
      this.selectedPCs = [];
      return;
    }

    const selectedDivObj = this.divisions.find(d => d.name === this.selectedDivision);
    if (selectedDivObj) {
      this.pcs = this.allPCs.filter(p => p.division_id === selectedDivObj.id);
    } else {
      this.pcs = [];
    }

    // Drop any PCs that don't belong to the new list (by name)
    const availablePCNames = this.pcs.map(p => p.name);
    this.selectedPCs = this.selectedPCs.filter(pcName => availablePCNames.includes(pcName));

    this.dropdownOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    const isInsideDropdown = target.closest('.dropdown-box') || target.closest('.dropdown-list');
    if (!isInsideDropdown) {
      this.dropdownOpen = false;
    }
  }

  toggleDropdown(): void {
    if (this.isBusy) return;
    this.dropdownOpen = !this.dropdownOpen;
  }

  onPCCheckboxChange(pcName: string, event: any) {
    if (this.isBusy) return;
    const isChecked = event.target.checked;
    if (isChecked && !this.selectedPCs.includes(pcName)) {
      this.selectedPCs.push(pcName);
    } else if (!isChecked) {
      this.selectedPCs = this.selectedPCs.filter(item => item !== pcName);
    }
  }

  showDivisionAlert(): void {
    if (!this.selectedDivision) {
      alert('Please select a division first.');
    }
  }

  editEmployee(index: number) {
    if (this.isBusy) return;
    const employee = this.employees[index];
    this.employeeId = employee.id;
    this.employeeName = employee.name;
    this.employeeEmail = employee.email;
    this.selectedDivision = employee.division;

    // Trigger division change to populate PCs, but we need to wait or do it synchronously
    // Since onDivisionChange relies on this.divisions and this.allPCs which are already loaded, it's synchronous.
    this.onDivisionChange();

    // Now set the selected PCs
    this.selectedPCs = employee.pc ? employee.pc.split(',').map((p: string) => p.trim()) : [];
    this.selectedTeam = employee.team;
    this.editingIndex = index;
  }

  saveEmployee() {
    if (this.isBusy) return;

    if (!this.employeeId || !this.employeeName || !this.employeeEmail || !this.selectedDivision || this.selectedPCs.length === 0 || !this.selectedTeam) {
      (window as any).Swal?.fire?.('Error', 'All fields are required!', 'error');
      return;
    }

    const employeeData = {
      Emp_ID: this.employeeId,
      Emp_Name: this.employeeName,
      EMP_Email: this.employeeEmail,
      Emp_Division: this.selectedDivision,
      Emp_PC: this.selectedPCs.join(','),
      Emp_Team: this.selectedTeam
    };

    const isEdit = this.editingIndex !== null;
    this.isBusy = true;

    const api$ = isEdit
      ? this.http.put(`${environment.apiUrl}/edit-employee`, employeeData)
      : this.http.post(`${environment.apiUrl}/add-employee`, employeeData);

    api$.subscribe(
      () => {
        this.isBusy = false;
        this.fetchEmployees();
        this.resetForm();
        (window as any).Swal?.fire?.('Success', isEdit ? 'Employee updated successfully!' : 'Employee added successfully!', 'success');
      },
      (error) => {
        this.isBusy = false;
        const errMsg = error?.error?.message || error?.error?.error || 'Something went wrong.';
        console.error('Error saving employee:', error);
        (window as any).Swal?.fire?.('Error', errMsg, 'error');
      }
    );
  }

  deleteEmployee(index: number) {
    if (this.isBusy) return;
    const employeeId = this.employees[index].id;

    (window as any).Swal?.fire?.({
      title: 'Are you sure?',
      text: 'This will delete the employee and associated data!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete it!'
    }).then((result: any) => {
      if (result.isConfirmed) {
        this.isBusy = true;
        this.http
          .delete(`${environment.apiUrl}/delete-employee/${employeeId}`)
          .subscribe(
            () => {
              this.isBusy = false;
              this.fetchEmployees();
              (window as any).Swal?.fire?.('Deleted!', 'Employee has been deleted.', 'success');
            },
            (error) => {
              this.isBusy = false;
              console.error('Error deleting employee:', error);
              (window as any).Swal?.fire?.('Error', 'Failed to delete employee.', 'error');
            }
          );
      }
    });
  }

  resetForm() {
    this.employeeId = '';
    this.employeeName = '';
    this.employeeEmail = '';
    this.selectedDivision = '';
    this.pcs = [];
    this.selectedPCs = [];
    this.selectedTeam = '';
    this.editingIndex = null;
    this.dropdownOpen = false;
  }
}
