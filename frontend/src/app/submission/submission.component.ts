import {
  Component,
  OnInit,
  HostListener,
  ChangeDetectorRef,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NgForm } from '@angular/forms';
import { debounceTime } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { AuthService } from '../auth.service';
import { environment } from 'src/environments/environment';

declare const Swal: any;

interface EmployeeOption {
  id: string; // EMP_ID
  name: string; // EMP_Name
  display: string; // "EMP_ID - EMP_Name"
}

@Component({
  selector: 'app-submission',
  templateUrl: './submission.component.html',
  styleUrls: ['./submission.component.scss'],
})
export class SubmissionComponent implements OnInit {
  private readonly API = `${environment.apiUrl}`;

  // Busy flag to prevent double-clicks
  isBusy = false;

  selectedFile: File | null = null;
  fileName = '';
  filePath = '';

  // Employees (used for Reviewer dropdown only now)
  employees: EmployeeOption[] = [];

  // CREATOR (now autofilled from login)
  creatorDropdownOpen = false;
  creatorSearch = '';
  filteredCreators: EmployeeOption[] = [];
  selectedCreatorId = '';
  selectedCreatorDisplay = '';
  selectedCreator: any = {
    emp_PC: '',
    emp_division: '',
    emp_team: '',
    emp_email: '',
    emp_name: '',
  };

  // REVIEWER dropdown
  reviewerDropdownOpen = false;
  reviewerSearch = '';
  filteredReviewers: EmployeeOption[] = [];
  selectedReviewerId = '';
  selectedReviewerDisplay = '';
  selectedFiles: File[] = [];
  fileNamesDisplay = '';

  selectedReviewer: any = { emp_email: '' };
  selectedReviewerEmail = '';

  // PC from creator
  selectedPC = '';
  pcList: string[] = [];
  displaySinglePC = true;

  // Drawing type
  drawingDropdownOpen = false;
  drawingTypes = [
    'Casted Machined Drawing',
    'Decal',
    'Dimension Drawing',
    'Ferrous Casting Drawing',
    'Flexible',
    'Foam',
    'Hose',
    'Installation Drawing',
    'Instruction Drawing',
    'Non-Casted Machined Drawing',
    'Non-Ferrous Casting Drawing',
    'Piping Other',
    'Sheet Metal Drawing',
    'Supplier Drawing',
    'Welded Piping',
  ];
  selectedDrawingType = '';

  // Misc
  designNo = '';
  decision: 'approve' | 'reject' = 'approve';
  creatorEmail = '';
  taskNumber = ''; // NEW
  comments = ''; // NEW

  // debouncers
  creatorSearch$ = new Subject<string>();
  reviewerSearch$ = new Subject<string>();

  constructor(
    private http: HttpClient,
    private cdRef: ChangeDetectorRef,
    private auth: AuthService,
  ) { }

  ngOnInit() {
    // Debounced search (for Reviewer dropdown only)
    this.creatorSearch$
      .pipe(debounceTime(250))
      .subscribe((txt) => this.filterCreators(txt));
    this.reviewerSearch$
      .pipe(debounceTime(250))
      .subscribe((txt) => this.filterReviewers(txt));

    // 1) Get logged-in Creator ID
    const me = this.auth.getLoggedInUser?.();
    if (!me || typeof me !== 'string' || !me.trim()) {
      Swal.fire('Session expired', 'Please log in again.', 'warning');
      return;
    }
    this.selectedCreatorId = me.trim();

    // 2) Fetch creator details (PC / division / team / email / name)
    this.fetchCreatorDetails(this.selectedCreatorId);

    // 3) Load employees for reviewer dropdown
    this.fetchEmployees();
  }

  // Dropdown toggles
  toggleCreatorDropdown() {
    this.creatorDropdownOpen = !this.creatorDropdownOpen;
    if (this.creatorDropdownOpen) this.filteredCreators = [...this.employees];
  }
  toggleReviewerDropdown() {
    this.reviewerDropdownOpen = !this.reviewerDropdownOpen;
    if (this.reviewerDropdownOpen) this.filteredReviewers = [...this.employees];
  }
  toggleDrawingDropdown() {
    this.drawingDropdownOpen = !this.drawingDropdownOpen;
  }

  // Close dropdowns when clicking elsewhere
  @HostListener('document:click', ['$event'])
  closeDropdowns(event: Event) {
    const el = event.target as HTMLElement;
    if (!el.closest('.custom-dropdown')) {
      this.creatorDropdownOpen = false;
      this.reviewerDropdownOpen = false;
      this.drawingDropdownOpen = false;
    }
  }

  // Fetch employees once (id+name)
  fetchEmployees() {
    this.http.get<any[]>(`${this.API}/get-employees`).subscribe(
      (data) => {
        this.employees = (data || [])
          .map((row: any) => {
            const id: string = (row.Emp_ID || row.emp_id || '')
              .toString()
              .trim();
            const name: string = (row.Emp_Name || row.emp_name || '')
              .toString()
              .trim();
            return {
              id,
              name,
              display: id && name ? `${id} - ${name}` : id || name,
            };
          })
          .filter((e) => !!e.id);

        this.filteredCreators = [...this.employees];
        this.filteredReviewers = [...this.employees];

        // If we already know the creator ID, try to show "ID - Name"
        if (this.selectedCreatorId && !this.selectedCreatorDisplay) {
          const meRow = this.employees.find(
            (e) => e.id === this.selectedCreatorId,
          );
          if (meRow) this.selectedCreatorDisplay = meRow.display;
        }

        this.cdRef.detectChanges();
      },
      (error) => console.error('Error fetching employees:', error),
    );
  }

  // Search
  onCreatorSearchChange(text: string) {
    this.creatorSearch$.next(text);
  }
  onReviewerSearchChange(text: string) {
    this.reviewerSearch$.next(text);
  }
  private filterCreators(text: string) {
    const q = (text || '').toLowerCase();
    this.filteredCreators = this.employees.filter((e) =>
      e.display.toLowerCase().includes(q),
    );
  }
  private filterReviewers(text: string) {
    const q = (text || '').toLowerCase();
    this.filteredReviewers = this.employees.filter((e) =>
      e.display.toLowerCase().includes(q),
    );
  }

  selectCreator(emp: EmployeeOption, event: Event) {
    event.stopPropagation();
    this.selectedCreatorId = emp.id;
    this.selectedCreatorDisplay = emp.display;
    this.creatorDropdownOpen = false;
    this.fetchCreatorDetails(emp.id);
  }

  selectReviewer(emp: EmployeeOption, event: Event) {
    event.stopPropagation();
    this.selectedReviewerId = emp.id;
    this.selectedReviewerDisplay = emp.display;
    this.reviewerSearch = emp.display; // Update input
    this.reviewerDropdownOpen = false;
    this.fetchReviewerDetails(emp.id);
  }

  // Fetch creator's full record
  fetchCreatorDetails(empId: string) {
    if (!empId) return;

    this.http.get<any>(`${this.API}/get-employee/${empId}`).subscribe(
      (data) => {
        this.selectedCreator = data || {
          emp_PC: '',
          emp_division: '',
          emp_team: '',
          emp_email: '',
          emp_name: '',
        };

        // Build "ID - Name" label if we have a name
        if (!this.selectedCreatorDisplay) {
          const name = (this.selectedCreator.emp_name || '').toString().trim();
          this.selectedCreatorDisplay = name ? `${empId} - ${name}` : empId;
        }

        // Fill email
        this.creatorEmail = (this.selectedCreator.emp_email || '').toString();

        // Handle PC (single vs multi)
        const rawPC = (this.selectedCreator.emp_PC || '').toString().trim();
        if (rawPC.includes(',')) {
          this.pcList = rawPC
            .split(',')
            .map((pc: string) => pc.trim())
            .filter((pc: string) => pc.length > 0);
          this.displaySinglePC = false;
          this.selectedPC = this.pcList.length > 0 ? this.pcList[0] : '';
        } else {
          this.pcList = [rawPC];
          this.displaySinglePC = true;
          this.selectedPC = rawPC;
        }
      },
      (error) => console.error('Error fetching creator details:', error),
    );
  }

  fetchReviewerDetails(empId: string) {
    if (!empId) return;

    this.http.get<any>(`${this.API}/get-employee/${empId}`).subscribe(
      (data) => {
        this.selectedReviewer = data || { emp_email: '' };
        this.selectedReviewerEmail = (
          this.selectedReviewer.emp_email || ''
        ).toString();
      },
      (error) => {
        console.error('Error fetching reviewer details:', error);
        this.selectedReviewer = { emp_email: '' };
        this.selectedReviewerEmail = '';
      },
    );
  }

  // File selection
  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }
    // Only PDFs
    const all = Array.from(input.files).filter((f) =>
      f.name.toLowerCase().endsWith('.pdf'),
    );
    this.selectedFiles = [...this.selectedFiles, ...all];
    this.updateFileNamesDisplay();

    // Reset input so same file can be selected again
    input.value = '';
  }

  // Remove individual file
  removeFile(index: number) {
    if (this.isBusy) return;
    this.selectedFiles.splice(index, 1);
    this.updateFileNamesDisplay();
  }

  // Update file names display
  private updateFileNamesDisplay() {
    this.fileNamesDisplay = this.selectedFiles.map((f) => f.name).join(', ');
  }

  fetchCreatorEmail(creatorId: string) {
    if (!creatorId) return;
    this.http
      .get<{ email: string }>(`${this.API}/get-creator-email/${creatorId}`)
      .subscribe(
        (response) => {
          this.creatorEmail = response.email;
        },
        () => {
          this.creatorEmail = '';
        },
      );
  }

  selectDrawingType(type: string, event: Event) {
    event.stopPropagation();
    this.selectedDrawingType = type;
    this.drawingDropdownOpen = false;
  }

  // Submit
  onSubmit(form: NgForm) {
    if (this.isBusy) return;

    if (!this.selectedFiles?.length) {
      Swal.fire({
        icon: 'error',
        title: 'No Files Selected',
        text: 'Please select one or more PDFs.',
      });
      return;
    }
    if (!this.selectedCreatorId) {
      Swal.fire({
        icon: 'error',
        title: 'Missing Creator',
        text: 'Creator could not be determined from your session.',
      });
      return;
    }
    if (!this.selectedReviewerId) {
      Swal.fire({
        icon: 'error',
        title: 'Missing Reviewer',
        text: 'Please select a reviewer.',
      });
      return;
    }
    if (!this.selectedReviewerEmail) {
      Swal.fire({
        icon: 'error',
        title: 'Reviewer Email',
        text: 'Reviewer email could not be fetched.',
      });
      return;
    }
    if (!this.selectedPC) {
      Swal.fire({
        icon: 'error',
        title: 'Missing PC',
        text: 'Please select a Profit Center (PC).',
      });
      return;
    }
    if (!this.selectedDrawingType) {
      Swal.fire({
        icon: 'error',
        title: 'Missing Drawing Type',
        text: 'Please choose a drawing type.',
      });
      return;
    }
    this.submitBatch(form);
  }

  private submitBatch(form: NgForm, isSpecialCase: boolean = false, filesToSubmit?: File[]) {
    this.isBusy = true;

    const fd = new FormData();
    const files = filesToSubmit || this.selectedFiles;
    files.forEach((f) => fd.append('pdfs', f, f.name));

    fd.append('creator_emp_id', this.selectedCreatorId);
    fd.append('reviewer_emp_id', this.selectedReviewerId);
    fd.append('reviewer_email', this.selectedReviewerEmail);
    fd.append('creator_email', (this.selectedCreator.emp_email || '').toString());
    fd.append('division', (this.selectedCreator.emp_division || '').toString());
    fd.append('team', (this.selectedCreator.emp_team || '').toString());
    fd.append('pc', (this.selectedPC || '').toString());
    fd.append('drawing_type', this.selectedDrawingType);
    fd.append('decision', this.decision);

    fd.append('task_number', (form.value.taskNumber || '').toString());
    fd.append('comments', (form.value.comments || '').toString());
    fd.append('design_no', (form.value.designNo || '').toString());
    fd.append('client_revision_no', (form.value.revisionNo || '').toString());

    if (isSpecialCase) {
      fd.append('allow_special_case', 'true');
    }

    this.http.post(`${this.API}/submit-batch`, fd).subscribe({
      next: (res: any) => {
        this.isBusy = false;
        const results: any[] = res?.results || [];
        const rejected: string[] = res?.rejected || [];

        // Show summary popup first, reset form after they click OK
        this.showSummaryPopup(results, rejected, form, files);
      },
      error: (err) => {
        const msg = err?.error?.message || 'Submission failed. Please try again.';
        Swal.fire({ icon: 'error', title: 'Submission Failed', text: msg });
        this.isBusy = false;
      },
    });
  }

  private showSummaryPopup(results: any[], rejected: string[], form: NgForm, originalFiles: File[]) {
    const newFiles = results.filter((r: any) => r.type === 'new');
    const updatedFiles = results.filter((r: any) => r.type === 'updated');

    let html = `<div class="sum-popup-body">`;

    if (newFiles.length > 0) {
      const rows = newFiles
        .map((r: any) => `
          <div class="sum-row">
            <span class="sum-draw">📄 ${r.drawing_id}</span>
            <span class="sum-badge-new">New · Rev 1</span>
          </div>`)
        .join('');
      html += `
        <div class="sum-section">
          <div class="sum-title sum-title-new"><span style="color:#16a34a;font-weight:bold;">✓</span> New Drawings Added (${newFiles.length})</div>
          <div class="sum-list">${rows}</div>
        </div>`;
    }

    if (updatedFiles.length > 0) {
      const rows = updatedFiles
        .map((r: any) => `
          <div class="sum-row">
            <span class="sum-draw">📄 ${r.drawing_id}</span>
            <div class="sum-rev-col">
              <span class="sum-badge-upd">Updated · Rev ${r.revision}</span>
              <div class="sum-prev">Previous: Rev ${r.previous_revision}</div>
            </div>
          </div>`)
        .join('');
      html += `
        <div class="sum-section">
          <div class="sum-title sum-title-upd">🔄 Existing Drawings Updated (${updatedFiles.length})</div>
          <div class="sum-list">${rows}</div>
        </div>`;
    }

    if (rejected && rejected.length > 0) {
      const rows = rejected
        .map((fname: string) => `
          <div class="sum-row">
            <span class="sum-draw">📄 ${fname}</span>
            <span class="sum-badge-skip">Skipped</span>
          </div>`)
        .join('');
      html += `
        <div class="sum-section">
          <div class="sum-title sum-title-skip">⚠️ Skipped — Invalid Naming (${rejected.length})</div>
          <div class="sum-list">${rows}</div>
        </div>`;
    }

    html += '</div>';

    const hasRejected = rejected && rejected.length > 0;

    Swal.fire({
      icon: results.length > 0 ? 'success' : 'warning',
      title: 'Submission Complete',
      html,
      width: '580px',
      showDenyButton: hasRejected,
      denyButtonText: 'Special Case Accept',
      confirmButtonColor: '#2563eb',
      confirmButtonText: 'OK',
    }).then((result: any) => {
      if (result.isDenied && hasRejected) {
        // User clicked Special Case Accept
        const rejectedFiles = originalFiles.filter(f => rejected.includes(f.name));
        this.submitBatch(form, true, rejectedFiles);
      } else {
        // User clicked OK or dismissed, reset form now
        form.resetForm();
        this.resetFormState();
        this.selectedCreatorId = this.auth.getLoggedInUser?.() || '';
        if (this.selectedCreatorId) this.fetchCreatorDetails(this.selectedCreatorId);
      }
    });
  }

  private resetFormState(): void {
    this.selectedFile = null;
    this.fileName = '';
    this.selectedCreatorDisplay = '';
    this.selectedCreator = {
      emp_PC: '',
      emp_division: '',
      emp_team: '',
      emp_email: '',
      emp_name: '',
    };

    this.selectedReviewerId = '';
    this.selectedReviewerDisplay = '';
    this.selectedReviewer = { emp_email: '' };
    this.selectedReviewerEmail = '';

    this.selectedPC = '';
    this.pcList = [];
    this.displaySinglePC = true;

    this.selectedDrawingType = '';
    this.designNo = '';
    this.decision = 'approve';

    this.selectedFiles = [];
    this.fileNamesDisplay = '';

    // Reset new fields
    this.taskNumber = '';
    this.comments = '';
  }
}
