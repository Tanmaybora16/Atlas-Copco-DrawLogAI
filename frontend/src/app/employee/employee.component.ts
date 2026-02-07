import { Component, OnInit, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-employee',
  templateUrl: './employee.component.html',
  styleUrls: ['./employee.component.scss']
})
export class EmployeeComponent implements OnInit {
  divisions = ['AIA', 'APE', 'CTS', 'IAS', 'IAT', 'OFA', 'PFL', 'VIN'];
  divisionToPCMap: { [key: string]: string[] } = {
    'AIA': ['BQR', 'API', 'WUX', 'COX', 'PNE', 'FRJ', 'UTY', 'TRD', 'ITJ', 'PNB'],
    'APE': ['PNE', 'UVC', 'WUX', 'BQR', 'APP'],
    'CTS': ['APC'],
    'IAS': ['PNE', 'ESF', 'UVC', 'WUX', 'BQR'],
    'IAT': ['BQR', 'API', 'WUX', 'COX', 'PNE', 'FRJ', 'UTY', 'TRD', 'ITJ', 'ITR'],
    'OFA': ['API', 'WUX', 'COX', 'PNE', 'UTY', 'TRD', 'ITJ', 'PNB', 'Crepelle', 'UTF', 'APF', 'OFA STD'],
    'PFL': ['PNE', 'ESF', 'UVC', 'WUX', 'BQR'],
    'VIN': ['Edwards India (IPG)', 'UWH', 'PNE', 'ESF', 'UVC', 'WUX', 'BQR']
  };
  pcs: string[] = [];
  teams = ['CPI 1', 'TSG 1', 'TSG 2', 'TSG 3'];

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

  isBusy = false;  // <-- in-flight guard for all API calls

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.fetchEmployees();
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
  // Build the new PC list for the chosen division
  this.pcs = this.selectedDivision ? (this.divisionToPCMap[this.selectedDivision] || []) : [];

  // Drop any PCs that belonged to the previous division
  this.selectedPCs = this.selectedPCs.filter(pc => this.pcs.includes(pc));

  // If you want to fully clear the selection whenever division changes, use this instead:
  // this.selectedPCs = [];

  // Reset single-select fallback (if you use selectedPC elsewhere)
  this.selectedPC = '';

  // Close the PC dropdown so the user re-opens with the fresh list
  this.dropdownOpen = false;
}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    const isInsideDropdown = target.closest('.dropdown-box') || target.closest('.dropdown-list');
    if (!isInsideDropdown) {
      this.dropdownOpen = false; // Close the dropdown if the click is outside
    }
  }

  toggleDropdown(): void {
    if (this.isBusy) return;
    this.dropdownOpen = !this.dropdownOpen;
  }

  onPCCheckboxChange(pc: string, event: any) {
    if (this.isBusy) return;
    const isChecked = event.target.checked;
    if (isChecked && !this.selectedPCs.includes(pc)) {
      this.selectedPCs.push(pc);
    } else if (!isChecked) {
      this.selectedPCs = this.selectedPCs.filter(item => item !== pc);
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
    this.onDivisionChange(); // Update PC list based on division
    this.selectedPCs = employee.pc ? employee.pc.split(',') : []; // Convert CSV to array
    this.selectedTeam = employee.team;
    this.editingIndex = index;
    this.updatePCs(); // Update PCs dropdown when editing
  }

  saveEmployee() {
    if (this.isBusy) return; // prevent double submit

    if (!this.employeeId || !this.employeeName || !this.employeeEmail || !this.selectedDivision || this.selectedPCs.length === 0 || !this.selectedTeam) {
      (window as any).Swal?.fire?.('Error', 'All fields are required!', 'error');
      return;
    }

    const employeeData = {
      Emp_ID: this.employeeId,
      Emp_Name: this.employeeName,
      EMP_Email: this.employeeEmail,
      Emp_Division: this.selectedDivision,
      Emp_PC: this.selectedPCs.join(','), // Store as CSV string
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
        this.fetchEmployees(); // will set busy true/false again
        this.resetForm();
        (window as any).Swal?.fire?.('Success', isEdit ? 'Employee updated successfully!' : 'Employee added successfully!', 'success');
      },
      (error) => {
        this.isBusy = false;
        const errMsg = error?.error?.message || error?.error?.error || 'Something went wrong.';
        switch (error.status) {
          case 4001:
            (window as any).Swal?.fire?.('Error', 'Invalid request format. Please contact admin.', 'error');
            break;
          case 4002:
            (window as any).Swal?.fire?.('Error', 'All fields are required!', 'error');
            break;
          case 4003:
            (window as any).Swal?.fire?.('Error', 'Employee ID already exists!', 'error');
            break;
          case 400:
            (window as any).Swal?.fire?.('Error', errMsg || 'Invalid input data.', 'error');
            break;
          case 500:
            (window as any).Swal?.fire?.('Server Error', errMsg, 'error');
            break;
          default:
            (window as any).Swal?.fire?.('Error', 'Unexpected error occurred. Please try again.', 'error');
        }
        console.error('Error saving employee:', error);
      }
    );
  }

  deleteEmployee(index: number) {
    if (this.isBusy) return; // prevent multi-clicks
    const employeeId = this.employees[index].id;

    (window as any).Swal?.fire?.({
      title: 'Are you sure?',
      text: 'This will delete the employee and associated data!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete it!',
      cancelButtonText: 'Cancel'
    }).then((result: any) => {
      if (result.isConfirmed) {
        this.isBusy = true;
        this.http
          .delete(`${environment.apiUrl}/delete-employee/${employeeId}`)
          .subscribe(
            () => {
              this.isBusy = false;
              this.fetchEmployees();
              (window as any).Swal?.fire?.(
                'Deleted!',
                'Employee has been deleted.',
                'success'
              );
            },
            (error) => {
              this.isBusy = false;
              const errMsg = error?.error?.error || 'Something went wrong.';
              (window as any).Swal?.fire?.(
                'Error',
                `Failed to delete employee: ${errMsg}`,
                'error'
              );
              console.error('Error deleting employee:', error);
            }
          );
      }
    });
  }

  updatePCs() {
    this.pcs = this.selectedDivision ? this.divisionToPCMap[this.selectedDivision] || [] : [];
    if (!this.pcs.includes(this.selectedPC)) {
      this.selectedPC = ''; // Reset PC if it is not in the filtered list
    }
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
