import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NgForm } from '@angular/forms';
import { ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from 'src/environments/environment';
import { AuthService } from '../auth.service';

declare const Swal: any;

interface UploadResponse {
  file_name: string;
  file_path: string;
  extracted_comments: string[];
  predicted_errors: string[];
  design_number: string;
  classifier_model_version?: string;
}

interface ErrorCodeCount {
  code: string;
  count: number;
}

interface ErrorCodeCatalogItem {
  code: string;
  description: string;
}

interface ReviewPredictionRow {
  comment: string;
  classifierCode: string;
  finalCode: string;
  reviewStatus: 'kept_classifier' | 'corrected' | 'needs_review' | 'removed';
  removed: boolean;
}

interface FeedbackHistoryItem {
  comment: string;
  classifier_prediction: string | null;
  final_code: string | null;
  review_decision: string;
  reviewed_at: string | null;
}

@Component({
  selector: 'app-uploads',
  templateUrl: './uploads.component.html',
  styleUrls: ['./uploads.component.scss'],
})
export class UploadsComponent {
  private readonly API = `${environment.apiUrl}`;

  // State
  selectedFile: File | null = null;
  fileName = '';
  filePath = '';
  extractedComments: string[] = [];
  predictedErrors: string[] = [];
  reviewRows: ReviewPredictionRow[] = [];
  errorCodeCatalog: ErrorCodeCatalogItem[] = [];
  feedbackReady = false;
  feedbackHistory: FeedbackHistoryItem[] = [];
  feedbackHistoryError = '';
  feedbackHistoryLoading = false;
  readonly feedbackHistoryPageSize = 10;
  feedbackHistoryPage = 1;
  classifierModelVersion = '';
  predictionError = '';
  errorCounts: ErrorCodeCount[] = [];
  decision: string = 'approve';

  // Autofilled meta
  designNo = '';
  taskNumber = '';
  reviewerId = '';
  revisionNo = '';
  reviewedDate = '';
  drawing_type = '';

  selectedEmpId = '';
  selectedEmployee: any = { emp_PC: '', emp_division: '', emp_team: '' };
  selectedPC = '';

  // UI flags
  showCodeList = false;
  hasErrors = true;
  editedRows = new Set<number>();
  originalErrors: { [key: number]: string } = {};
  editedIndex: number | null = null;
  selectedError = '';
  submitted = false;
  submissionSucceeded = false;
  isRevisionReadonly = true;

  // Prevent duplicate calls
  isUploading = false;
  isSubmitting = false;

  constructor(
    private http: HttpClient,
    private cdRef: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) { }

  ngOnInit() {
    this.loadErrorCodeCatalog();
    this.route.queryParamMap.subscribe((params) => {
      const drawingId = (params.get('drawing_id') || '').trim();
      const rev = (params.get('revision') || '').trim();
      if (drawingId) {
        this.prefillFromServer(drawingId, rev);
        if (rev) this.loadFeedbackHistory(drawingId, Number(rev));
        else {
          this.feedbackHistory = [];
          this.feedbackHistoryPage = 1;
        }
      } else {
        this.feedbackHistory = [];
        this.feedbackHistoryPage = 1;
      }
    });
  }

  private loadFeedbackHistory(drawingNo: string, revision: number) {
    this.feedbackHistoryPage = 1;
    this.feedbackHistoryLoading = true;
    this.feedbackHistoryError = '';
    this.http.get<any>(`${this.API}/api/drawings/${encodeURIComponent(drawingNo)}/${revision}/feedback`).subscribe({
      next: response => {
        this.feedbackHistory = response?.feedback || [];
        this.feedbackHistoryPage = 1;
      },
      error: error => {
        this.feedbackHistory = [];
        this.feedbackHistoryPage = 1;
        this.feedbackHistoryError = error?.status === 403 || error?.status === 401
          ? 'You are not authorized to view feedback for this drawing.'
          : error?.status === 503
            ? 'Feedback history is unavailable until the feedback migration is applied.'
            : 'Could not load feedback history for this drawing.';
      },
      complete: () => this.feedbackHistoryLoading = false
    });
  }

  get feedbackHistoryTotalPages(): number {
    return Math.max(1, Math.ceil(this.feedbackHistory.length / this.feedbackHistoryPageSize));
  }

  get pagedFeedbackHistory(): FeedbackHistoryItem[] {
    const start = (this.feedbackHistoryPage - 1) * this.feedbackHistoryPageSize;
    return this.feedbackHistory.slice(start, start + this.feedbackHistoryPageSize);
  }

  previousFeedbackHistoryPage() {
    if (this.feedbackHistoryPage > 1) this.feedbackHistoryPage--;
  }

  nextFeedbackHistoryPage() {
    if (this.feedbackHistoryPage < this.feedbackHistoryTotalPages) this.feedbackHistoryPage++;
  }

  exportFeedbackCsv(audit = false) {
    const endpoint = audit ? 'audit.csv' : 'export.csv';
    this.http.get(`${this.API}/api/reviewer-feedback/${endpoint}`, { responseType: 'blob' }).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = audit ? 'reviewer-feedback-audit.csv' : 'reviewer-confirmed-error-codes.csv';
        link.click();
        URL.revokeObjectURL(url);
      },
      error: error => {
        const message = error?.status === 403 ? 'CSV export is available to administrators only.'
          : error?.status === 503 ? 'Apply the reviewer feedback migration before exporting.'
            : 'Feedback export failed.';
        Swal.fire('Export unavailable', message, 'error');
      }
    });
  }

  get canExportFeedback(): boolean {
    return this.authService.getAccessType() === 'HR';
  }

  private loadErrorCodeCatalog() {
    this.http.get<any>(`${this.API}/api/error-codes`).subscribe({
      next: response => {
        this.errorCodeCatalog = response?.codes || [];
        this.feedbackReady = response?.feedback_ready === true && this.authService.hasApiToken();
        if (!this.feedbackReady) {
          this.predictionError = response?.feedback_ready === true
            ? 'A secure backend session is required. Please sign out and sign in again.'
            : 'The feedback database migration is required before this review can be submitted.';
        }
        if (this.reviewRows.length) {
          this.reviewRows.forEach(row => {
            if (row.finalCode && !this.errorCodeCatalog.some(item => item.code === row.finalCode)) {
              row.finalCode = '';
              row.reviewStatus = 'needs_review';
            }
          });
          this.syncLegacyPredictionArrays();
        }
      },
      error: () => this.predictionError = 'The official code catalog could not be loaded. Code selection is unavailable.'
    });
  }

  private prefillFromServer(drawingId: string, revision: string) {
    const q: any = { drawing_id: drawingId };
    if (revision) q.revision = revision;

    this.http.get<any>(`${this.API}/prefill-upload`, { params: q }).subscribe({
      next: (res) => {
        this.selectedEmpId = res.creator_id || '';
        this.selectedEmployee = {
          emp_PC: res.emp_PC || '',
          emp_division: res.emp_division || '',
          emp_team: res.emp_team || '',
        };
        this.selectedPC = res.emp_PC || '';

        this.reviewerId = (res.reviewer_id || '').replace(/^EMP_/i, '');
        this.designNo = res.design_no_plain || '';
        this.revisionNo = String(res.revision_no ?? '').padStart(2, '0');
        this.drawing_type = res.Drawing_Type || '';
        this.reviewedDate = (res.reviewed_date || this.todayISO()).slice(0, 10);
        this.taskNumber = res.task_number || '';

        this.cdRef.detectChanges();

        if (res.has_pdf === true) {
          const revNum = Number(res.revision_no ?? revision ?? this.revisionNo) || 0;
          if (revNum > 0) {
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
    const row = this.reviewRows[index];
    if (row) row.finalCode = row.classifierCode;
  }

  saveEditedValue(index: number, event: any) {
    if (event instanceof KeyboardEvent && event.key === 'Enter') {
      event.preventDefault();
    }
    const inputElement = event.target as HTMLInputElement;
    const newValue = (inputElement.value || '').trim();
    this.updateFinalCode(index, newValue);
  }

  getErrorDescription(code: string): string {
    return this.errorCodeCatalog.find(item => item.code === code)?.description || 'No description available';
  }

  updateFinalCode(index: number, code: string) {
    const row = this.reviewRows[index];
    if (!row || (code && !this.errorCodeCatalog.some(item => item.code === code))) return;
    row.finalCode = code;
    row.reviewStatus = code
      ? (code === row.classifierCode ? 'kept_classifier' : 'corrected')
      : 'needs_review';
    this.syncLegacyPredictionArrays();
  }

  private syncLegacyPredictionArrays() {
    const active = this.reviewRows.filter(row => !row.removed);
    this.extractedComments = active.map(row => row.comment);
    this.predictedErrors = active.map(row => row.finalCode).filter(Boolean);
    this.errorCounts = this.countErrorOccurrences(this.predictedErrors);
    if (!this.predictedErrors.length) this.decision = 'approve';
  }

  // FILE UPLOAD → extract errors
  onFileSelected(event: Event) {
    const fileInput = event.target as HTMLInputElement;
    if (!fileInput.files || fileInput.files.length === 0) return;
    this.submissionSucceeded = false;
    this.selectedFile = fileInput.files[0];
    this.fileName = this.selectedFile.name;
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
        this.classifierModelVersion = response.classifier_model_version || '';
        const comments: string[] = response.extracted_comments || [];
        const baseline: string[] = response.predicted_errors || [];
        this.extractedComments = comments;
        this.predictedErrors = baseline;
        this.reviewRows = comments.reduce<ReviewPredictionRow[]>((rows, comment, index) => {
          if (!comment || comment.toLowerCase() === 'no annotations found') return rows;
          const classifierCode = baseline[index] || '';
          const codeIsActive = this.errorCodeCatalog.some(item => item.code === classifierCode);
          rows.push({
            comment,
            classifierCode,
            finalCode: codeIsActive ? classifierCode : '',
            reviewStatus: codeIsActive ? 'kept_classifier' : 'needs_review',
            removed: false
          });
          return rows;
        }, []);
        this.syncLegacyPredictionArrays();
        this.errorCounts = this.countErrorOccurrences(this.predictedErrors);
        this.decision = this.predictedErrors.length > 0 ? 'reject' : 'approve';
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

  private loadPdfFromServer(drawingId: string, revision: number) {
    const url = `${this.API}/drawings/${encodeURIComponent(drawingId)}/${revision}/pdf/download`;

    this.http.get(url, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const name = `${drawingId}-${String(revision).padStart(2, '0')}.pdf`;
        try {
          const file = new File([blob], name, {
            type: 'application/pdf',
            lastModified: Date.now(),
          });
          this.selectedFile = file;
          this.fileName = name;
          this.extractErrors();
          this.isRevisionReadonly = false;
        } catch (e) {
          console.error('Failed to create File from blob', e);
          Swal.fire('PDF error', 'Could not prepare the PDF for analysis. Please upload a file manually.', 'error');
        }
      },
      error: (err) => {
        console.error('Failed to fetch existing PDF', err);
        Swal.fire('PDF not found', 'No stored PDF found for this drawing/revision. Please upload a PDF to continue.', 'info');
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

    if (this.reviewRows.length && !this.errorCodeCatalog.length) {
      Swal.fire('Code catalog unavailable', 'Reload when the official code catalog is available so submitted codes can be validated.', 'error');
      return;
    }
    if (this.reviewRows.length && !this.feedbackReady) {
      Swal.fire('Database migration required', 'Ask the database administrator to apply the reviewer feedback migration before submitting this review.', 'error');
      return;
    }

    this.syncLegacyPredictionArrays();

    const submissionData = {
      file_name: this.fileName || 'Unknown',
      file_path: this.filePath || 'Unknown',
      extracted_comments: this.extractedComments.length
        ? this.extractedComments
        : ['No comments found'],
      predicted_errors: this.predictedErrors.length
        ? this.predictedErrors
        : ['No errors detected'],
      ...(this.reviewRows.length ? {
        classifier_model_version: this.classifierModelVersion,
        review_feedback: this.reviewRows.map(row => ({
          comment: row.comment,
          classifier_prediction: row.classifierCode || null,
          final_code: row.removed ? null : row.finalCode || null,
          review_status: row.removed ? 'removed' : row.reviewStatus === 'needs_review' ? 'needs_review' : null
        }))
      } : {}),
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
        task_number: (this.taskNumber || '').trim(),
        comments: (form.value.comments || '').trim()
      },
    };

    this.isSubmitting = true;

    this.http.post(`${this.API}/submit`, submissionData).subscribe({
      next: (_response: any) => {
        this.submissionSucceeded = true;
        Swal.fire({
          icon: 'success',
          title: 'Submission Successful',
          text:
            'The form has been submitted successfully! An email has been sent to the creator (on reject).',
        });

        const drawingNo = String(_response?.drawing_id || '').trim();
        const revision = Number(_response?.revision || this.revisionNo);
        if (drawingNo && revision) this.loadFeedbackHistory(drawingNo, revision);

        form.resetForm();
        this.resetFormState();
      },
      error: (error) => {
        this.isSubmitting = false;
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
    this.reviewRows = [];
    this.classifierModelVersion = '';
    this.predictionError = '';
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
    this.isRevisionReadonly = true;
  }

  private countErrorOccurrences(errors: string[]): ErrorCodeCount[] {
    const map: Record<string, number> = {};
    for (const e of errors) map[e] = (map[e] || 0) + 1;
    return Object.keys(map).map((code) => ({ code, count: map[code] }));
  }

  // Called by <app-error-code> when a code is removed from the summary pills
  removeError(errorCode: string) {
    this.reviewRows.forEach(row => {
      if (row.finalCode === errorCode) {
        row.removed = true;
        row.finalCode = '';
        row.reviewStatus = 'removed';
      }
    });
    this.syncLegacyPredictionArrays();
  }

  deleteRow(index: number) {
    const row = this.reviewRows[index];
    if (!row) return;
    row.removed = !row.removed;
    if (row.removed) {
      row.finalCode = '';
      row.reviewStatus = 'removed';
    } else {
      row.reviewStatus = row.finalCode
        ? (row.finalCode === row.classifierCode ? 'kept_classifier' : 'corrected')
        : 'needs_review';
    }
    this.syncLegacyPredictionArrays();
  }
}
