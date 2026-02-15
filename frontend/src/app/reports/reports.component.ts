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
  teams = ['CPI 1', 'CPI 2', 'CPI 3', 'CPI 4', 'TSG 1', 'TSG 2', 'TSG 3', 'TSG 4', 'AIA']; // Assuming AIA is also a team? Or just using the list from EmployeeComponent

  // Data variables
  pcs: string[] = ['BQR', 'API', 'WUX', 'COX', 'PNE', 'FRJ', 'UTY', 'TRD', 'ITJ', 'PNB', 'APP', 'APC', 'ESF', 'UVC', 'Crepelle', 'UTF', 'APF', 'OFA STD', 'Edwards India (IPG)', 'UWH']; // Hardcoded all unique PCs since no Team->PC map
  selectedTeam: string = '';
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

  selectedTeams: string[] = [];
  selectedPCs: string[] = [];

  startDate: string = '';
  endDate: string = '';

  showTeams: boolean = false;
  showPCs: boolean = false;
  showEmployeeDropdown: boolean = false;
  showDrawingIdDropdown: boolean = false;
  showDefaultDropdowns: boolean = true;


  selectTeam(team: string) {
    this.selectedTeam = team;
    this.showTeams = false;
    // this.updatePCList(); // No mapping for now
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

  toggleSelection(value: string, category: string) {
    let list: string[] = category === 'team' ? this.selectedTeams : this.selectedPCs;
    const index = list.indexOf(value);
    index === -1 ? list.push(value) : list.splice(index, 1);
  }

  @HostListener('document:click', ['$event'])
  closeDropdown(event: Event) {
    if (!(event.target as HTMLElement).closest('.dropdown-container')) {
      this.showTeams = false;
      this.showPCs = false;
    }
  }

  onReportChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedReport = value as any;

    this.showDefaultDropdowns = ['monthly', 'trend', 'passRatio'].includes(this.selectedReport);
    this.showEmployeeDropdown = this.selectedReport === 'employeeReport';
    this.showDrawingIdDropdown = this.selectedReport === 'drawingReport';

    // Reset specific selections to avoid confusion
    if (this.showDefaultDropdowns) {
      // Keep team/pc selections
    } else {
      // Maybe reset? For now ensure correct dropdowns are shown
    }
  }

  filterEmployees() {
    if (!this.empSearch) {
      this.filteredEmployees = this.employees;
    } else {
      this.filteredEmployees = this.employees.filter(emp =>
        emp.toLowerCase().includes(this.empSearch.toLowerCase())
      );
    }
  }

  filterDrawings() {
    if (!this.drawingSearch) {
      this.filteredDrawings = this.drawings;
    } else {
      this.filteredDrawings = this.drawings.filter(drawing =>
        drawing.toLowerCase().includes(this.drawingSearch.toLowerCase())
      );
    }
  }

  onDateChange(event: Event, type: string) {
    const value = (event.target as HTMLInputElement).value;
    type === 'start' ? (this.startDate = value) : (this.endDate = value);
  }
}
