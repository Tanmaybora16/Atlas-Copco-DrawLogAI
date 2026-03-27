import { Component, OnInit, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-reports',
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.scss'],
})
export class ReportsComponent implements OnInit {
  selectedReport: 'monthly' | 'trend' | 'employeeReport' | 'drawingReport' | 'passRatio' | 'taskReport' = 'monthly';

  teams: any[] = [];
  pcs: any[] = [];
  selectedTeams: string[] = [];
  selectedPCs: string[] = [];
  employees: string[] = [];
  filteredEmployees: string[] = [];
  empSearch: string = '';
  selectedEmpId: string = '';
  drawings: string[] = [];
  filteredDrawings: string[] = [];
  drawingSearch: string = '';
  selectedDrawingId: string = '';
  startDate: string = '';
  endDate: string = '';
  showTeams: boolean = false;
  showPCs: boolean = false;
  showTeamDropdown: boolean = true;
  showPCDropdown: boolean = true;
  showEmployeeDropdown: boolean = false;
  showDrawingIdDropdown: boolean = false;
  showEmployees: boolean = false;
  showDrawings: boolean = false;

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.fetchInitialData();
    this.fetchEmployees();
    this.fetchDrawings();
  }

  fetchInitialData() {
    this.http.get<any[]>(`${environment.apiUrl}/api/structure/teams`).subscribe(data => this.teams = data || []);
    this.http.get<any[]>(`${environment.apiUrl}/api/structure/pcs`).subscribe(data => {
      // Deduplicate PCs by name to avoid duplicates in the dropdown
      const uniquePCs = new Map();
      (data || []).forEach(pc => {
        if (!uniquePCs.has(pc.name)) {
          uniquePCs.set(pc.name, pc);
        }
      });
      this.pcs = Array.from(uniquePCs.values());
    });
  }

  fetchEmployees() {
    this.http.get<string[]>(`${environment.apiUrl}/api/employees-dropdown`).subscribe({
      next: (data) => {
        this.employees = data || [];
        this.filteredEmployees = [...this.employees];
      },
      error: (err) => {
        console.error('Failed to fetch employees', err);
      }
    });
  }

  fetchDrawings() {
    this.http.get<string[]>(`${environment.apiUrl}/api/drawings-dropdown`).subscribe({
      next: (data) => {
        this.drawings = data || [];
        this.filteredDrawings = [...this.drawings];
      },
      error: (err) => {
        console.error('Failed to fetch drawings', err);
      }
    });
  }

  toggleTeam(team: string) {
    if (this.selectedTeams.includes(team)) {
      this.selectedTeams = this.selectedTeams.filter(t => t !== team);
    } else {
      this.selectedTeams = [...this.selectedTeams, team];
    }
  }

  togglePC(pc: string) {
    if (this.selectedPCs.includes(pc)) {
      this.selectedPCs = this.selectedPCs.filter(p => p !== pc);
    } else {
      this.selectedPCs = [...this.selectedPCs, pc];
    }
  }

  selectAllTeams() {
    this.selectedTeams = this.teams.map(t => t.name);
  }

  deselectAllTeams() {
    this.selectedTeams = [];
  }

  selectAllPCs() {
    this.selectedPCs = this.pcs.map(p => p.name);
  }

  deselectAllPCs() {
    this.selectedPCs = [];
  }

  getSelectedTeamsDisplay(): string {
    if (this.selectedTeams.length === 0) return 'Select Team';
    if (this.selectedTeams.length === this.teams.length) return 'All Teams';
    if (this.selectedTeams.length > 2) return `${this.selectedTeams.length} Teams Selected`;
    return this.selectedTeams.join(', ');
  }

  getSelectedPCsDisplay(): string {
    if (this.selectedPCs.length === 0) return 'Select PC';
    if (this.selectedPCs.length === this.pcs.length) return 'All PCs';
    if (this.selectedPCs.length > 2) return `${this.selectedPCs.length} PCs Selected`;
    return this.selectedPCs.join(', ');
  }

  selectEmployee(emp: string) {
    // emp is "EMP_ID - Name", extract just the ID for API calls
    this.selectedEmpId = emp.includes(' - ') ? emp.split(' - ')[0].trim() : emp;
    this.empSearch = emp;
    this.showEmployees = false;
  }

  selectDrawing(drawing: string) {
    this.selectedDrawingId = drawing;
    this.drawingSearch = drawing;
    this.showDrawings = false;
  }

  toggleSelection(value: string, category: string) {
    if (category === 'team') {
      this.toggleTeam(value);
    } else {
      this.togglePC(value);
    }
  }

  @HostListener('document:click', ['$event'])
  closeDropdown(event: Event) {
    if (!(event.target as HTMLElement).closest('.dropdown-container')) {
      this.showTeams = false;
      this.showPCs = false;
      this.showEmployees = false;
      this.showDrawings = false;
    }
  }

  onReportChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedReport = value as any;

    this.showTeamDropdown = ['monthly', 'trend', 'passRatio', 'taskReport'].includes(this.selectedReport);
    this.showPCDropdown = ['monthly', 'trend', 'passRatio'].includes(this.selectedReport);
    this.showEmployeeDropdown = this.selectedReport === 'employeeReport';
    this.showDrawingIdDropdown = this.selectedReport === 'drawingReport';
    // For taskReport, all above are false, which naturally hides them.
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
