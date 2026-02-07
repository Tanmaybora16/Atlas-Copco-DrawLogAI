import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NgForm } from '@angular/forms';
import { ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from 'src/environments/environment';

declare const Swal: any;

interface UploadResponse {
  file_name: string;
  file_path: string;
  extracted_comments: string[];
  predicted_errors: string[];
  design_number: string;
}

interface ErrorCodeCount {
  code: string;
  count: number;
}

@Component({
  selector: 'app-uploads',
  templateUrl: './uploads.component.html',
  styleUrls: ['./uploads.component.scss'],
})
export class UploadsComponent {
  private readonly API = `${environment.apiUrl}`;

  // state
  selectedFile: File | null = null;
  fileName = '';
  filePath = '';
  extractedComments: string[] = [];
  predictedErrors: string[] = [];
  errorCounts: ErrorCodeCount[] = [];
  decision: string = 'approve';

  // autofilled meta
  designNo = '';
  reviewerId = '';
  revisionNo = '';
  reviewedDate = '';
  drawing_type = '';

  selectedEmpId = '';
  selectedEmployee: any = { emp_PC: '', emp_division: '', emp_team: '' };
  selectedPC = '';

  // ui flags
  showCodeList = false;
  hasErrors = true;
  editedRows = new Set<number>();
  originalErrors: { [key: number]: string } = {};
  editedIndex: number | null = null;
  selectedError = '';
  submitted = false;
  isRevisionReadonly = true; // Initially readonly when auto-loaded from canvas

  // disable duplicate calls
  isUploading = false;
  isSubmitting = false;

  constructor(
    private http: HttpClient,
    private cdRef: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    // Prefill when routed from Requests page
    this.route.queryParamMap.subscribe((params) => {
      const drawingId = (params.get('drawing_id') || '').trim();
      const rev = (params.get('revision') || '').trim();
      
      console.log('🎬 UPLOADS ngOnInit - Query params:', { drawing_id: drawingId, revision: rev });
      
      if (drawingId) {
        this.prefillFromServer(drawingId, rev);
      }
    });
  }

  // Removed unused method

  private prefillFromServer(drawingId: string, revision: string) {
    console.log('🔍 UPLOADS prefillFromServer called with:', { drawingId, revision });
    
    const q: any = { drawing_id: drawingId };
    if (revision) q.revision = revision;

    this.http.get<any>(`${this.API}/prefill-upload`, { params: q }).subscribe({
      next: (res) => {
        console.log('📦 UPLOADS Backend response:', res);
        
        // creator + org
        this.selectedEmpId = res.creator_id || '';
        this.selectedEmployee = {
          emp_PC: res.emp_PC || '',
          emp_division: res.emp_division || '',
          emp_team: res.emp_team || '',
        };
        this.selectedPC = res.emp_PC || '';

        // reviewer + drawing meta
        this.reviewerId = (res.reviewer_id || '').replace(/^EMP_/i, '');
        this.designNo = res.design_no_plain || '';
        this.revisionNo = String(res.revision_no ?? '').padStart(2, '0');
        this.drawing_type = res.Drawing_Type || '';
        this.reviewedDate = (res.reviewed_date || this.todayISO()).slice(0, 10);

        console.log('✅ UPLOADS After assignment - revisionNo:', this.revisionNo, 'from res.revision_no:', res.revision_no);

        this.cdRef.detectChanges();

        // 🚀 Auto-fetch stored PDF (if present) and run AI extraction
        if (res.has_pdf === true) {
          const revNum =
            Number(res.revision_no ?? revision ?? this.revisionNo) || 0;
          console.log('📄 UPLOADS Loading PDF with revision:', revNum);
          if (revNum > 0) {
            // We can build the URL directly; backend route is already wired
            this.loadPdfFromServer(res.drawing_id || drawingId, revNum);
          }
        }
      },
      error: (err) => {
        console.error('prefill-upload error', err);
        Swal.fire('Notice', 'Unable to prefill data for this request.', 'info');
      },
    });
  }

  // Removed unused method

  private todayISO(): string {
    return new Date().toISOString().slice(0, 10);
  }

  // error table interactions
  get toggleIcon() {
    return this.showCodeList ? '/assets/grid.svg' : '/assets/list.svg';
  }

  toggleCodeList() {
    this.showCodeList = !this.showCodeList;
    if (this.showCodeList) {
      this.errorCounts = this.countErrorOccurrences(this.predictedErrors);
    }
  }

  editRow(index: number) {
    this.editedIndex = index;
    this.selectedError = this.predictedErrors[index];
    if (!(index in this.originalErrors)) {
      this.originalErrors[index] = this.predictedErrors[index];
    }
  }

  saveEditedValue(index: number, event: any) {
    if (event instanceof KeyboardEvent && event.key === 'Enter') {
      event.preventDefault();
    }
    const inputElement = event.target as HTMLInputElement;
    const newValue = (inputElement.value || '').trim();
    const originalValue = this.originalErrors[index];

    if (newValue) {
      this.predictedErrors[index] = newValue;
      if (newValue !== originalValue) {
        this.editedRows.add(index);
      } else {
        this.editedRows.delete(index);
      }
      this.errorCounts = this.countErrorOccurrences(this.predictedErrors);
    }
    this.editedIndex = null;
  }

  getErrorDescription(code: string): string {
    return this.errorDescriptions[code] || 'No description available';
  }

  // FILE UPLOAD → extract errors
  onFileSelected(event: Event) {
    const fileInput = event.target as HTMLInputElement;
    if (!fileInput.files || fileInput.files.length === 0) return;

    this.selectedFile = fileInput.files[0];
    this.fileName = this.selectedFile.name;
    // Make revision field editable when user manually selects a file
    this.isRevisionReadonly = false;
    this.extractErrors();
  }

  private extractErrors() {
    if (!this.selectedFile) {
      Swal.fire({
        icon: 'error',
        title: 'No File Selected',
        text: 'Please select a PDF file before proceeding.',
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', this.selectedFile);

    this.isUploading = true;
    this.http.post<UploadResponse>(`${this.API}/upload`, formData).subscribe({
      next: (response) => {
        this.filePath = response.file_path;
        this.extractedComments = response.extracted_comments || [];
        this.predictedErrors = response.predicted_errors || [];
        this.errorCounts = this.countErrorOccurrences(this.predictedErrors);
        this.decision = this.predictedErrors.length > 0 ? 'reject' : 'approve';

        // Make revision field editable after PDF is loaded
        this.isRevisionReadonly = false;

        Swal.fire({
          icon: 'success',
          title: 'File Uploaded',
          text: 'Errors have been successfully extracted!',
        });
      },
      error: (error) => {
        console.error('Upload error', error);
        Swal.fire({
          icon: 'error',
          title: 'Upload Failed',
          text:
            error?.error?.message ||
            'An error occurred while uploading the file.',
        });
      },
      complete: () => (this.isUploading = false),
    });
  }

  // 🔹 NEW: fetch stored PDF and run the same AI pipeline automatically
  private loadPdfFromServer(drawingId: string, revision: number) {
    const url = `${this.API}/drawings/${encodeURIComponent(
      drawingId
    )}/${revision}/pdf/download`;

    console.log('📥 Fetching PDF from server:', url);

    // We don't set isUploading here; extractErrors() will handle the busy state
    this.http.get(url, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const name = `${drawingId}-${String(revision).padStart(2, '0')}.pdf`;
        console.log('📥 PDF downloaded:', name, `(${blob.size} bytes)`);

        try {
          // Create a File object so we can reuse the exact same flow
          const file = new File([blob], name, {
            type: 'application/pdf',
            lastModified: Date.now(),
          });
          this.selectedFile = file;
          this.fileName = name;

          // Kick off AI extraction
          console.log('🔍 Extracting errors from server PDF...');
          this.extractErrors();
          // Make revision field editable after PDF is loaded
          this.isRevisionReadonly = false;
        } catch (e) {
          console.error('Failed to create File from blob', e);
          Swal.fire(
            'PDF error',
            'Could not prepare the PDF for analysis. Please upload a file manually.',
            'error'
          );
        }
      },
      error: (err) => {
        console.error('Failed to fetch existing PDF', err);
        Swal.fire(
          'PDF not found',
          'No stored PDF found for this drawing/revision. Please upload a PDF to continue.',
          'info'
        );
      },
    });
  }

  onSubmit(form: NgForm) {
    if (!this.selectedFile) {
      Swal.fire({
        icon: 'error',
        title: 'No File Selected',
        text: 'Please select a file before submitting.',
      });
      return;
    }

    const submissionData = {
      file_name: this.fileName || 'Unknown',
      file_path: this.filePath || 'Unknown',
      extracted_comments: this.extractedComments.length
        ? this.extractedComments
        : ['No comments found'],
      predicted_errors: this.predictedErrors.length
        ? this.predictedErrors
        : ['No errors detected'],
      // creator_email removed: backend already looks it up
      form_data: {
        designNo: (this.designNo || '').trim(),
        reviewerName: (this.reviewerId || '').trim(),
        revisionNo: (this.revisionNo || '').trim(),
        reviewedDate: (this.reviewedDate || '').trim(),
        drawingType: (this.drawing_type || 'Unknown').trim(),
        creatorId: (this.selectedEmpId || '').trim(),
        division: (this.selectedEmployee.emp_division || '').trim(),
        pc: (this.selectedPC || '').trim(),
        team: (this.selectedEmployee.emp_team || '').trim(),
        decision: this.decision,
      },
    };

    this.isSubmitting = true;

    this.http.post(`${this.API}/submit`, submissionData).subscribe({
      next: (_response: any) => {
        Swal.fire({
          icon: 'success',
          title: 'Submission Successful',
          text:
            'The form has been submitted successfully! An email has been sent to the creator (on reject).',
        });

        form.resetForm();
        this.resetFormState();
      },
      error: (error) => {
        console.error('Submission Error:', error);
        const message = this.getFriendlyErrorMessage(error);
        Swal.fire({ icon: 'error', title: 'Submission Failed', text: message });
      },
      complete: () => (this.isSubmitting = false),
    });
  }

  private getFriendlyErrorMessage(error: any): string {
    if (!error || !error.status) {
      return 'Unknown error occurred. Please check your connection or try again.';
    }
    if (error.status === 0) return 'Backend server is not reachable. Please try again later.';
    if (error.status === 400) return 'Bad Request. Please check the submitted fields.';
    if (error.status === 401) return 'Unauthorized. Please log in and try again.';
    if (error.status === 404) return 'API endpoint not found.';
    if (error.status === 409) return 'Conflict error. This usually means duplicate data exists.';
    if (error.status === 5001) return 'Duplicate revision number detected for this drawing.';
    if (error.status === 500) {
      const msg = error.error?.message || '';
      if (msg.includes('IntegrityError')) {
        if (msg.includes('duplicate') || msg.includes('UNIQUE constraint failed')) {
          return 'Duplicate entry found. Please check the drawing number and revision.';
        }
        if (msg.includes('foreign key constraint')) {
          return 'Invalid foreign key reference. Please check employee or drawing ID.';
        }
      }
      if (msg.includes('ValueError')) return 'Invalid value provided. Please check your inputs.';
      return 'Internal Server Error. Please try again later.';
    }
    return error.error?.message || 'An unexpected error occurred. Please try again.';
  }

  private resetFormState(): void {
    this.selectedFile = null;
    this.fileName = '';
    this.filePath = '';
    this.extractedComments = [];
    this.predictedErrors = [];
    this.errorCounts = [];
    this.decision = 'approve';
    this.selectedEmpId = '';
    this.selectedEmployee = { emp_PC: '', emp_division: '', emp_team: '' };
    this.selectedPC = '';
    this.drawing_type = '';
    this.reviewerId = '';
    this.designNo = '';
    this.revisionNo = '';
    this.reviewedDate = '';
    this.submitted = false;
    this.editedRows.clear();
    this.originalErrors = {};
    this.editedIndex = null;
    this.selectedError = '';
    // Reset revision field to readonly when form is reset
    this.isRevisionReadonly = true;
  }

  private countErrorOccurrences(errors: string[]): ErrorCodeCount[] {
    const map: Record<string, number> = {};
    for (const e of errors) map[e] = (map[e] || 0) + 1;
    return Object.keys(map).map((code) => ({ code, count: map[code] }));
  }

  // Descriptions unchanged
  errorDescriptions: { [key: string]: string } = {
    P1: '1254 K Criteria for surface roughness',
    P2: '1350 K-f,m,c or v as required General tolerances and standard references',
    P3: '1356 K Indirectly stated tolerances for fusion welding',
    P4: '4366 K  Threaded blind holes',
    P4a: '4366:01 K  Threaded blind holes_ASME',
    P5: '6131 K Dimensional tolerances and machining allowances for castings',
    P6: '6134 K Specifications for steel and iron casting requirements',
    P7: '6136 K Specifications of aluminium casting requirements',
    P8: '6785 AIR Paint specifications',
    P9: '6891 K Indication of welding data on drawings',
    P11: 'Confidentiality note. It should contain “This document is property of Atlas Copco AB and shall not without our permission be altered, copied, used for manufacturing or communicated to any other person or company”.',
    P12: 'Prohibited substances note',
    P13: 'Sharp edges note',
    P14: 'Check drawing & document edition, vault edition and BPCS edition are same',
    P15: 'Part or assy linked to document',
    P16: 'All parts latest revision',
    P17: 'Material  assigned. Should be given in title block of the drawing. Exception for tabular drawing',
    P18: 'Material  comment added (T for thickness) if not dimensioned',
    P19: 'Treatment assigned, or not applicable. Should be given in title block of the drawing. Exception for tabular drawing',
    P20: 'Treatment see drawing',
    P22: 'Latest edition of Atlas Copco template used. Exception US: Latest edition of ANSI templates used',
    P23: 'Check for spelling mistake',
    P24: 'Page numbering if applicable  ',
    P26: 'Standard scale used. Exception US: Scales to be used 1/1; 1/2; 1/4; 2/1; 3/1; 4/1; 5/1; 10/1',
    P27: 'Are section/detail views nominated',
    P28: 'All basic dimensions available',
    P29: 'Tolerances deviating from general tolerance',
    P30: 'Geometrical tolerances stated correctly',
    P31: 'Revision note and symbol(s) available and equal',
    P32: 'Welding symbols all available',
    P33: 'Surface roughness symbols and indicators',
    P34: 'All centermarks and centerlines drawn for holes / symmetric parts',
    P35: 'Ten digit numbers',
    P36: 'Confidentiality class: Confidential',
    P37: 'Confidentiality class: Internal',
    P38: 'Text on drawing acc.Atlas Copco standard 1212 K . - English & Portugese text should have font "Arial" - Chinese text should have font "Simsun"',
    P39: 'Is the drawing unambigously',
    P40: 'Approval notification if needeed (PED, ASME,….)',
    P41: 'Symbol(s) of quantity Atlas Copco standard 1420 K',
    P42: 'All R/S or - markings correct',
    P43: 'No material on standard parts',
    P44: 'Material and comment complete if applicable',
    P46: 'Check that no dimensions are manually changed',
    P47: 'Check that at least english language is used',
    P48: 'Check that Part numbers and Qty are not manually overwritten',
    P49: 'Check that the drawing does not relates to a standard part',
    P50: 'Check weight on drawing',
    P51: "In case of tabular drawing, all mentioned 3D's should be linked to the tabular drawing",
    P57: 'Check edition is available for all item numbers of a tabular drawing',
    P58: 'Check supplier information is not given on bought out parts except for situations referenced in AC Standard 1015K',
    P59: 'Check brand logo in template - supplier parts/Manufacturing parts - AC logo. For dimension drawing, installation drawing, ASL, AIB -de-brand or owned brand',
    P70: 'Check \'All files are "For Approval" or "Approved" during ECO',
  };

  // Called by <app-error-code> when a code is removed from the summary pills
  removeError(errorCode: string) {
    this.predictedErrors = this.predictedErrors.filter(code => code !== errorCode);
    this.errorCounts = this.countErrorOccurrences(this.predictedErrors);
    if (this.predictedErrors.length === 0) {
      this.decision = 'approve';
    }
    this.editedRows.clear();
    this.originalErrors = {};
    this.editedIndex = null;
    this.selectedError = '';
  }

  // Newly Added Part ofr deleting the comment in uploads page
  deleteRow(index: number) {
    if (confirm('Are you sure you want to delete this comment and its error code?')) {
      // Remove from both arrays
      this.extractedComments.splice(index, 1);
      this.predictedErrors.splice(index, 1);
      
      // Update error counts
      this.errorCounts = this.countErrorOccurrences(this.predictedErrors);
      
      // Clean up edit tracking for this row
      this.editedRows.delete(index);
      delete this.originalErrors[index];
      
      // Reindex edit tracking (shift down indices after deleted row)
      const newEditedRows = new Set<number>();
      const newOriginalErrors: { [key: number]: string } = {};
      
      this.editedRows.forEach(rowIndex => {
        if (rowIndex > index) {
          newEditedRows.add(rowIndex - 1);
        } else if (rowIndex < index) {
          newEditedRows.add(rowIndex);
        }
      });
      
      Object.keys(this.originalErrors).forEach(key => {
        const rowIndex = parseInt(key);
        if (rowIndex > index) {
          newOriginalErrors[rowIndex - 1] = this.originalErrors[rowIndex];
        } else if (rowIndex < index) {
          newOriginalErrors[rowIndex] = this.originalErrors[rowIndex];
        }
      });
      
      this.editedRows = newEditedRows;
      this.originalErrors = newOriginalErrors;
      
      // Reset edit mode if we were editing this or a later row
      if (this.editedIndex !== null && this.editedIndex >= index) {
        this.editedIndex = null;
        this.selectedError = '';
      }
      
      // Auto-approve if no errors left
      if (this.predictedErrors.length === 0) {
        this.decision = 'approve';
      }
    }
  }
}
