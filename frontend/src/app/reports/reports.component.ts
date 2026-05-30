import { Component, OnInit, HostListener } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-reports',
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.scss'],
})
export class ReportsComponent implements OnInit {
  selectedReport: 'monthly' | 'trend' | 'employeeReport' | 'drawingReport' | 'passRatio' | 'taskReport' | 'overview' = 'monthly';

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
  tasks: string[] = [];
  filteredTasks: string[] = [];
  taskNumberSearch: string = '';
  startDate: string = '';
  endDate: string = '';
  showTeams: boolean = false;
  showPCs: boolean = false;
  showTeamDropdown: boolean = true;
  showPCDropdown: boolean = true;
  showEmployeeDropdown: boolean = false;
  showDrawingIdDropdown: boolean = false;
  showTaskNumberInput: boolean = false;
  showEmployees: boolean = false;
  showDrawings: boolean = false;
  showTasks: boolean = false;

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.fetchInitialData();
    this.fetchEmployees();
    this.fetchDrawings();
    this.fetchTasks();
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
    let params = new HttpParams();
    if (this.selectedTeams && this.selectedTeams.length > 0) {
      this.selectedTeams.forEach(t => params = params.append('team', t));
    }

    this.http.get<string[]>(`${environment.apiUrl}/api/employees-dropdown`, { params }).subscribe({
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
    let params = new HttpParams();
    if (this.startDate) params = params.set('start_date', this.startDate);
    if (this.endDate) params = params.set('end_date', this.endDate);
    if (this.selectedTeams && this.selectedTeams.length > 0) {
      this.selectedTeams.forEach(t => params = params.append('team', t));
    }

    this.http.get<string[]>(`${environment.apiUrl}/api/drawings-dropdown`, { params }).subscribe({
      next: (data) => {
        this.drawings = data || [];
        this.filteredDrawings = [...this.drawings];
      },
      error: (err) => {
        console.error('Failed to fetch drawings', err);
      }
    });
  }

  fetchTasks() {
    let params = new HttpParams();
    if (this.startDate) params = params.set('start_date', this.startDate);
    if (this.endDate) params = params.set('end_date', this.endDate);
    if (this.selectedTeams && this.selectedTeams.length > 0) {
      this.selectedTeams.forEach(t => params = params.append('team', t));
    }

    this.http.get<string[]>(`${environment.apiUrl}/api/tasks-dropdown`, { params }).subscribe({
      next: (data) => {
        this.tasks = data || [];
        this.filteredTasks = [...this.tasks];
      },
      error: (err) => {
        console.error('Failed to fetch tasks', err);
      }
    });
  }

  toggleTeam(team: string, event?: Event) {
    const isMultiSelect = event ? ((event as MouseEvent).ctrlKey || (event as MouseEvent).metaKey) : false;

    if (isMultiSelect) {
      if (this.selectedTeams.includes(team)) {
        this.selectedTeams = this.selectedTeams.filter(t => t !== team);
      } else {
        this.selectedTeams = [...this.selectedTeams, team];
      }
    } else {
      // Radio behavior: single pick
      this.selectedTeams = [team];
    }
    this.fetchTasks();
    this.fetchDrawings();
    this.fetchEmployees();
  }

  togglePC(pc: string, event?: Event) {
    const isMultiSelect = event ? ((event as MouseEvent).ctrlKey || (event as MouseEvent).metaKey) : false;

    if (isMultiSelect) {
      if (this.selectedPCs.includes(pc)) {
        this.selectedPCs = this.selectedPCs.filter(p => p !== pc);
      } else {
        this.selectedPCs = [...this.selectedPCs, pc];
      }
    } else {
      this.selectedPCs = [pc];
    }
  }

  selectAllTeams() {
    this.selectedTeams = this.teams.map(t => t.name);
    this.fetchTasks();
    this.fetchDrawings();
    this.fetchEmployees();
  }

  deselectAllTeams() {
    this.selectedTeams = [];
    this.fetchTasks();
    this.fetchDrawings();
    this.fetchEmployees();
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

  selectTask(task: string) {
    this.taskNumberSearch = task;
    this.showTasks = false;
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
      this.showTasks = false;
    }
  }

  onReportChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedReport = value as any;

    this.showTeamDropdown = ['monthly', 'trend', 'passRatio', 'taskReport', 'employeeReport', 'drawingReport'].includes(this.selectedReport);
    this.showPCDropdown = ['monthly', 'trend', 'passRatio'].includes(this.selectedReport);
    this.showEmployeeDropdown = this.selectedReport === 'employeeReport';
    this.showDrawingIdDropdown = this.selectedReport === 'drawingReport';
    this.showTaskNumberInput = this.selectedReport === 'taskReport';
    // Overview only shows Date Range filters (handled by exclusion)

    // For taskReport, all above are false, which naturally hides them.
    
    // Clear selections when switching reports
    this.selectedTeams = [];
    this.selectedPCs = [];
    this.empSearch = '';
    this.selectedEmpId = '';
    this.drawingSearch = '';
    this.selectedDrawingId = '';
    this.taskNumberSearch = '';

    // Re-fetch dependent dropdown items with cleared team/date filters
    this.fetchTasks();
    this.fetchDrawings();
    this.fetchEmployees();
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

  filterTasks() {
    if (!this.taskNumberSearch) {
      this.filteredTasks = this.tasks;
    } else {
      this.filteredTasks = this.tasks.filter(task =>
        task.toLowerCase().includes(this.taskNumberSearch.toLowerCase())
      );
    }
  }

  onDateChange(event: Event, type: string) {
    const value = (event.target as HTMLInputElement).value;
    type === 'start' ? (this.startDate = value) : (this.endDate = value);
    this.fetchTasks();
    this.fetchDrawings();
  }
}
