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
    this.submitBatch(form, {});
  }

  // type alias kept in the component so the template can reference it if needed
  private submitBatch(
    form: NgForm,
    fileActions: Record<string, 'overwrite' | 'increment' | 'ignore'>,
    filesToSend?: File[]
  ) {
    this.isBusy = true;

    const fd = new FormData();
    const files = filesToSend ?? this.selectedFiles;
    files.forEach((f) => fd.append('pdfs', f, f.name));

    // shared metadata
    fd.append('creator_emp_id', this.selectedCreatorId);
    fd.append('reviewer_emp_id', this.selectedReviewerId);
    fd.append('reviewer_email', this.selectedReviewerEmail);
    fd.append('creator_email', (this.selectedCreator.emp_email || '').toString());
    fd.append('division', (this.selectedCreator.emp_division || '').toString());
    fd.append('team', (this.selectedCreator.emp_team || '').toString());
    fd.append('pc', (this.selectedPC || '').toString());
    fd.append('drawing_type', this.selectedDrawingType);
    fd.append('decision', this.decision);
    fd.append('file_actions', JSON.stringify(fileActions));

    fd.append('task_number', (form.value.taskNumber || '').toString());
    fd.append('comments', (form.value.comments || '').toString());
    fd.append('design_no', (form.value.designNo || '').toString());
    fd.append('client_revision_no', (form.value.revisionNo || '').toString());

    this.http.post(`${this.API}/submit-batch`, fd).subscribe({
      next: (res: any) => {
        this.isBusy = false;

        const hasDuplicates = res?.duplicates && res.duplicates.length > 0;

        // Only show success toast if there are no outstanding duplicates
        if (!hasDuplicates) {
          const lines = (res?.results || [])
            .map((r: any) => `${r.drawing_id} - ${r.revision}`)
            .join(', ');
          Swal.fire({
            icon: 'success',
            title: 'Submission Successful',
            html: res?.message || `Processed files.<br/>Revisions: ${lines}`,
          });
          form.resetForm();
          this.resetFormState();
          this.selectedCreatorId = this.auth.getLoggedInUser?.() || '';
          if (this.selectedCreatorId) this.fetchCreatorDetails(this.selectedCreatorId);
          this.showRejectedPopupIfNeeded(res?.rejected);
        } else {
          // There are duplicates — show per-file resolution popup.
          // Keep the duplicate files in selectedFiles for potential retry.
          const allFiles = filesToSend ?? this.selectedFiles;
          const duplicateFiles = allFiles.filter((f) =>
            (res.duplicates as string[]).includes(f.name)
          );
          this.showDuplicatePopup(res.duplicates as string[], duplicateFiles, form, res?.rejected);
        }
      },
      error: (err) => {
        const msg = err?.error?.message || 'Submission failed. Please try again.';
        Swal.fire({ icon: 'error', title: 'Submission Failed', text: msg });
        this.isBusy = false;
      },
    });
  }

  private showDuplicatePopup(
    duplicateNames: string[],
    duplicateFiles: File[],
    form: NgForm,
    rejected?: string[]
  ) {
    // ── Colour tokens ──────────────────────────────────────────────────────────
    const colors: Record<string, { bg: string; border: string; text: string }> = {
      overwrite: { bg: '#fff3cd', border: '#f0a500', text: '#7a5000' },
      increment: { bg: '#dbeafe', border: '#3b82f6', text: '#1e3a8a' },
      ignore: { bg: '#f3f4f6', border: '#9ca3af', text: '#374151' },
    };

    // ── Inline <style> for the :checked pseudo-class trick ────────────────────
    const styles = `
      <style>
        .dup-pill-radio { display:none; }
        .dup-pill-label {
          display:inline-flex; align-items:center; gap:5px;
          padding:5px 12px; border-radius:999px; font-size:12px; font-weight:500;
          cursor:pointer; border:1.5px solid #d1d5db; background:#f9fafb; color:#6b7280;
          transition:all .15s ease; user-select:none; white-space:nowrap;
        }
        .dup-pill-label:hover { filter:brightness(.95); }
        .dup-pill-radio[value="overwrite"]:checked ~ label[data-opt="overwrite"],
        .dup-opt-overwrite:has(input:checked) .dup-pill-label {
          background:${colors['overwrite'].bg}; border-color:${colors['overwrite'].border}; color:${colors['overwrite'].text}; font-weight:600;
        }
        .dup-pill-radio[value="increment"]:checked ~ label[data-opt="increment"],
        .dup-opt-increment:has(input:checked) .dup-pill-label {
          background:${colors['increment'].bg}; border-color:${colors['increment'].border}; color:${colors['increment'].text}; font-weight:600;
        }
        .dup-pill-radio[value="ignore"]:checked ~ label[data-opt="ignore"],
        .dup-opt-ignore:has(input:checked) .dup-pill-label {
          background:${colors['ignore'].bg}; border-color:${colors['ignore'].border}; color:${colors['ignore'].text}; font-weight:600;
        }
        .dup-group { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
        .dup-row { display:flex; align-items:center; justify-content:space-between;
                   padding:9px 12px; border-bottom:1px solid #e5e7eb; gap:12px; }
        .dup-row:last-child { border-bottom:none; }
        .dup-global-row { background:#1e293b; border-radius:8px 8px 0 0; padding:10px 12px; }
        .dup-file-name {
          font-size:12.5px; color:#334155; font-family:monospace;
          word-break:break-all; max-width:280px; flex-shrink:1;
        }
        .dup-global-label { font-size:13px; font-weight:600; color:#f1f5f9; letter-spacing:.3px; }
        .dup-table { width:100%; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; }
        .dup-pill-dot { width:7px; height:7px; border-radius:50%; background:currentColor; opacity:.7; }
      </style>`;

    // ── Helper: build one pill group ──────────────────────────────────────────
    const icons: Record<string, string> = {
      overwrite: '↺', increment: '+1', ignore: '—',
    };

    const pillGroup = (name: string, defaultVal: string) =>
      `<div class="dup-group">${['overwrite', 'increment', 'ignore'].map(opt => `
        <span class="dup-opt-${opt}">
          <input class="dup-pill-radio" type="radio" name="${name}" value="${opt}" id="${name}_${opt}" ${opt === defaultVal ? 'checked' : ''} />
          <label class="dup-pill-label" for="${name}_${opt}" data-opt="${opt}">
            <span class="dup-pill-dot"></span>${icons[opt]}&nbsp;${opt.charAt(0).toUpperCase() + opt.slice(1)}
          </label>
        </span>`).join('')}</div>`;

    // ── Build file rows ───────────────────────────────────────────────────────
    const fileRows = duplicateNames.map((fname, i) => `
      <div class="dup-row">
        <span class="dup-file-name" title="${fname}">📄 ${fname}</span>
        ${pillGroup(`file_${i}`, 'ignore')}
      </div>`).join('');

    const html = `
      ${styles}
      <div style="text-align:left;">
        <p style="font-size:13.5px;color:#475569;margin-bottom:10px;">
          The following revisions already exist. Choose an action for each:
        </p>
        <div class="dup-table">
          <div class="dup-global-row dup-row">
            <span class="dup-global-label">🌐 Global Default</span>
            ${pillGroup('global_action', '')}
          </div>
          ${fileRows}
        </div>
      </div>`;


    Swal.fire({
      title: 'Duplicate Revisions Found',
      html,
      icon: 'warning',
      width: '680px',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Apply',
      cancelButtonText: 'Cancel',
      didOpen: () => {
        const container = Swal.getHtmlContainer() as HTMLElement | null;
        if (!container) return;

        const globalRadios = Array.from(
          container.querySelectorAll('input[name="global_action"]') as NodeListOf<HTMLInputElement>
        );

        // Global default → cascade to all per-file rows
        globalRadios.forEach((radio: HTMLInputElement) => {
          radio.addEventListener('change', () => {
            const newVal = radio.value;
            duplicateNames.forEach((_, i) => {
              const fileRadio = container.querySelector(
                `input[name="file_${i}"][value="${newVal}"]`
              ) as HTMLInputElement | null;
              if (fileRadio) fileRadio.checked = true;
            });
          });
        });

        // Per-file change → deselect all global default radios
        duplicateNames.forEach((_, i) => {
          const fileRadios = Array.from(
            container.querySelectorAll(`input[name="file_${i}"]`) as NodeListOf<HTMLInputElement>
          );
          fileRadios.forEach((radio: HTMLInputElement) => {
            radio.addEventListener('change', () => {
              globalRadios.forEach((gr) => (gr.checked = false));
            });
          });
        });
      },
    }).then((result: any) => {
      if (!result.isConfirmed) {
        // User cancelled — show rejected popup if any, but don't reset form
        this.showRejectedPopupIfNeeded(rejected);
        return;
      }

      // Collect per-file selections from popup DOM
      const container = Swal.getHtmlContainer() as HTMLElement | null;
      const fileActions: Record<string, 'overwrite' | 'increment' | 'ignore'> = {};
      duplicateNames.forEach((fname: string, i: number) => {
        const checked = container
          ? (container.querySelector(`input[name="file_${i}"]:checked`) as HTMLInputElement | null)
          : null;
        fileActions[fname] = (checked?.value as any) ?? 'ignore';
      });

      // Only resubmit files that aren't set to 'ignore'
      const filesToRetry = duplicateFiles.filter(
        (f) => fileActions[f.name] !== 'ignore'
      );

      if (filesToRetry.length === 0) {
        this.showRejectedPopupIfNeeded(rejected);
        return;
      }

      // Always surface bad-naming rejections from the first response,
      // regardless of what the retry does with the duplicate files.
      this.showRejectedPopupIfNeeded(rejected);
      this.submitBatch(form, fileActions, filesToRetry);
    });
  }

  private showRejectedPopupIfNeeded(rejected?: string[]) {
    if (rejected && rejected.length > 0) {
      const rejectedFilesList = rejected.join('<br/>');
      setTimeout(() => {
        Swal.fire({
          icon: 'warning',
          title: 'Some Files Skipped',
          html: `The following files were skipped due to incorrect naming format (missing revision number '-#'):<br/><br/><strong>${rejectedFilesList}</strong>`,
        });
      }, 500);
    }
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
