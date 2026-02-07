import { Component, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-reports',
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.scss'],
})
export class ReportsComponent {
  selectedReport: 'monthly' | 'trend' | 'employeeReport' | 'drawingReport' | 'passRatio' = 'monthly';

  // Dropdown options
  divisions = ['AIA', 'APE', 'CTS', 'IAS', 'IAT', 'OFA', 'PFL', 'VIN'];

  divisionToPCMap: { [key: string]: string[] } = {
    'AIA': ['BQR', 'API', 'WUX', 'COX', 'PNE', 'FRJ', 'UTY', 'TRD', 'ITJ', 'PNB'],
    'APE': ['PNE', 'UVC', 'WUX', 'BQR', 'APP'],
    'CTS': ['APC'],
    'IAS': ['PNE', 'ESF', 'UVC', 'WUX', 'BQR'],
    'IAT': ['BQR', 'API', 'WUX', 'COX', 'PNE', 'FRJ', 'UTY', 'TRD', 'ITJ', 'ITR'],
    'OFA': ['API', 'WUX', 'COX', 'PNE', 'UTY', 'TRD', 'ITJ', 'PNB', 'Crepelle', 'UTF', 'APF', 'OFA STD'],
    'PFL': ['PNE', 'ESF', 'UVC', 'WUX', 'BQR'],
    'VIN': ['Edwards India (IPG)', 'UWH', 'PNE', 'ESF', 'UVC', 'WUX', 'BQR'],
  };

  // Data variables
  pcs: string[] = [];
  selectedDivision: string = '';
  selectedPC: string = '';
  employees: string[] = [];
  filteredEmployees: string[] = [];
  empSearch: string = '';
  selectedEmpId: string = '';
  showEmployees = false;
showDrawings = false;

  drawings: string[] = [];
  filteredDrawings: string[] = [];
  drawingSearch: string = '';
  selectedDrawingId: string = '';

  selectedDivisions: string[] = [];
  selectedPCs: string[] = [];

  startDate: string = '';
  endDate: string = '';

  showDivisions: boolean = false;
  showPCs: boolean = false;
  showEmployeeDropdown: boolean = false;
  showDrawingIdDropdown: boolean = false;
  showDefaultDropdowns: boolean = true;


  selectDivision(div: string) {
    this.selectedDivision = div;
    this.showDivisions = false;
    this.updatePCList(); // auto-load PCs
  }
  
  // Call this when a PC is selected
  selectPC(pc: string) {
    this.selectedPC = pc;
    this.showPCs = false;
  }
  
  // Select from filtered employee list
  selectEmployee(emp: string) {
    this.selectedEmpId = emp;
    this.showEmployees = false;
  }
  
  // Select from filtered drawing list
  selectDrawing(drawing: string) {
    this.selectedDrawingId = drawing;
    this.showDrawings = false;
  }

  private apiUrl = '';

  constructor(private http: HttpClient) {
    this.updateApiUrl();
    this.fetchData();
  }

  updateApiUrl() {
    switch (this.selectedReport) {
      case 'employeeReport':
        this.apiUrl = `${environment.apiUrl}/api/employees-dropdown`;
        break;
      case 'drawingReport':
        this.apiUrl = `${environment.apiUrl}/api/drawings-dropdown`;
        break;
      default:
        this.apiUrl = '';
    }
  }

  fetchData() {
    if (this.selectedReport === 'employeeReport') {
      this.fetchEmployeeIds();
    } else if (this.selectedReport === 'drawingReport') {
      this.fetchDrawingIds();
    }
  }

  onReportChange(event: any) {
    const newReport = event.target.value as 'monthly' | 'employeeReport' | 'drawingReport' | 'trend' | 'passRatio';
    if (newReport) {
      this.selectedReport = newReport;
    }

    this.showDefaultDropdowns = !['employeeReport', 'drawingReport'].includes(this.selectedReport);
    this.showEmployeeDropdown = this.selectedReport === 'employeeReport';
    this.showDrawingIdDropdown = this.selectedReport === 'drawingReport';

    this.updateApiUrl();
    this.fetchData();
  }

  fetchEmployeeIds() {
    if (this.apiUrl) {
      this.http.get<string[]>(this.apiUrl).subscribe(
        (data) => {
          this.employees = data;
          this.filteredEmployees = data; // Initialize filtered
        },
        (error) => console.error('Error fetching Employee IDs:', error)
      );
    }
  }

  fetchDrawingIds() {
    if (this.apiUrl) {
      this.http.get<string[]>(this.apiUrl).subscribe(
        (data) => {
          this.drawings = data;
          this.filteredDrawings = data; // Initialize filtered
        },
        (error) => console.error('Error fetching Drawing IDs:', error)
      );
    }
  }

  filterEmployees() {
    const query = this.empSearch.toLowerCase();
    this.filteredEmployees = this.employees.filter(emp =>
      emp.replace(/^EMP_/, '').toLowerCase().includes(query)
    );
  }

  filterDrawings() {
    const query = this.drawingSearch.toLowerCase();
    this.filteredDrawings = this.drawings.filter(drawing =>
      drawing.replace(/^DR_/, '').toLowerCase().includes(query)
    );
  }

  toggleSelection(value: string, category: string) {
    let list: string[] = category === 'division' ? this.selectedDivisions : this.selectedPCs;
    const index = list.indexOf(value);
    index === -1 ? list.push(value) : list.splice(index, 1);
    if (category === 'division') this.updatePCList();
  }

  updatePCList() {
    if (this.selectedDivision && this.divisionToPCMap[this.selectedDivision]) {
      this.pcs = this.divisionToPCMap[this.selectedDivision];
    } else {
      this.pcs = [];
    }
  
    this.selectedPC = ''; // reset PC on division change
  }
  

  @HostListener('document:click', ['$event'])
  closeDropdown(event: Event) {
    if (!(event.target as HTMLElement).closest('.dropdown-container')) {
      this.showDivisions = false;
      this.showPCs = false;
    }
  }

  onDateChange(event: Event, type: string) {
    const value = (event.target as HTMLInputElement).value;
    type === 'start' ? (this.startDate = value) : (this.endDate = value);
  }
}
