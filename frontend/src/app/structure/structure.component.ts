import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Component({
    selector: 'app-structure',
    templateUrl: './structure.component.html',
    styleUrls: ['./structure.component.scss']
})
export class StructureComponent implements OnInit {
    activeTab: 'divisions' | 'pcs' | 'teams' = 'divisions';

    divisions: any[] = [];
    pcs: any[] = [];
    teams: any[] = [];

    newDivisionName: string = '';
    newPCName: string = '';
    newPCDivisionId: number | null = null;
    newTeamName: string = '';

    isLoading = false;

    constructor(private http: HttpClient) { }

    ngOnInit(): void {
        this.loadData();
    }

    loadData() {
        this.isLoading = true;
        // Load all data in parallel
        const p1 = this.http.get<any[]>(`${environment.apiUrl}/api/structure/divisions`).toPromise();
        const p2 = this.http.get<any[]>(`${environment.apiUrl}/api/structure/pcs`).toPromise();
        const p3 = this.http.get<any[]>(`${environment.apiUrl}/api/structure/teams`).toPromise();

        Promise.all([p1, p2, p3]).then(([divisions, pcs, teams]) => {
            this.divisions = divisions || [];
            this.pcs = pcs || [];
            this.teams = teams || [];
            this.isLoading = false;
        }).catch(err => {
            console.error('Error loading structure data', err);
            this.isLoading = false;
        });
    }

    setActiveTab(tab: 'divisions' | 'pcs' | 'teams') {
        this.activeTab = tab;
    }

    // DIVISIONS
    addDivision() {
        if (!this.newDivisionName.trim()) return;
        this.isLoading = true;
        this.http.post(`${environment.apiUrl}/api/structure/divisions`, { name: this.newDivisionName })
            .subscribe({
                next: () => {
                    this.newDivisionName = '';
                    this.loadData();
                    (window as any).Swal?.fire?.('Success', 'Division added successfully!', 'success');
                },
                error: (err) => {
                    this.isLoading = false;
                    (window as any).Swal?.fire?.('Error', err.error?.error || 'Failed to add division', 'error');
                }
            });
    }

    deleteDivision(id: number) {
        (window as any).Swal?.fire?.({
            title: 'Are you sure?',
            text: 'This will delete the division!',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, delete it!'
        }).then((result: any) => {
            if (result.isConfirmed) {
                this.isLoading = true;
                this.http.delete(`${environment.apiUrl}/api/structure/divisions/${id}`).subscribe({
                    next: () => {
                        this.loadData();
                        (window as any).Swal?.fire?.('Deleted!', 'Division has been deleted.', 'success');
                    },
                    error: (err) => {
                        this.isLoading = false;
                        (window as any).Swal?.fire?.('Error', 'Failed to delete division', 'error');
                    }
                });
            }
        });
    }

    // PCs
    addPC() {
        if (!this.newPCName.trim() || !this.newPCDivisionId) {
            (window as any).Swal?.fire?.('Error', 'Name and Division are required', 'error');
            return;
        }
        this.isLoading = true;
        this.http.post(`${environment.apiUrl}/api/structure/pcs`, {
            name: this.newPCName,
            division_id: this.newPCDivisionId
        }).subscribe({
            next: () => {
                this.newPCName = '';
                this.newPCDivisionId = null;
                this.loadData();
                (window as any).Swal?.fire?.('Success', 'PC added successfully!', 'success');
            },
            error: (err) => {
                this.isLoading = false;
                (window as any).Swal?.fire?.('Error', err.error?.error || 'Failed to add PC', 'error');
            }
        });
    }

    deletePC(id: number) {
        (window as any).Swal?.fire?.({
            title: 'Are you sure?',
            text: 'This will delete the PC!',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, delete it!'
        }).then((result: any) => {
            if (result.isConfirmed) {
                this.isLoading = true;
                this.http.delete(`${environment.apiUrl}/api/structure/pcs/${id}`).subscribe({
                    next: () => {
                        this.loadData();
                        (window as any).Swal?.fire?.('Deleted!', 'PC has been deleted.', 'success');
                    },
                    error: (err) => {
                        this.isLoading = false;
                        (window as any).Swal?.fire?.('Error', 'Failed to delete PC', 'error');
                    }
                });
            }
        });
    }

    getDivisionName(id: number): string {
        const div = this.divisions.find(d => d.id === parseInt(id as any));
        // The API returns division_id as int, but checking just in case
        return div ? div.name : 'Unknown';
    }

    // TEAMS
    addTeam() {
        if (!this.newTeamName.trim()) return;
        this.isLoading = true;
        this.http.post(`${environment.apiUrl}/api/structure/teams`, { name: this.newTeamName })
            .subscribe({
                next: () => {
                    this.newTeamName = '';
                    this.loadData();
                    (window as any).Swal?.fire?.('Success', 'Team added successfully!', 'success');
                },
                error: (err) => {
                    this.isLoading = false;
                    (window as any).Swal?.fire?.('Error', err.error?.error || 'Failed to add team', 'error');
                }
            });
    }

    deleteTeam(id: number) {
        (window as any).Swal?.fire?.({
            title: 'Are you sure?',
            text: 'This will delete the team!',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, delete it!'
        }).then((result: any) => {
            if (result.isConfirmed) {
                this.isLoading = true;
                this.http.delete(`${environment.apiUrl}/api/structure/teams/${id}`).subscribe({
                    next: () => {
                        this.loadData();
                        (window as any).Swal?.fire?.('Deleted!', 'Team has been deleted.', 'success');
                    },
                    error: (err) => {
                        this.isLoading = false;
                        (window as any).Swal?.fire?.('Error', 'Failed to delete team', 'error');
                    }
                });
            }
        });
    }
}
