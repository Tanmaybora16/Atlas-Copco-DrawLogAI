import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { UploadsComponent } from './uploads.component';
import { AuthService } from '../auth.service';

describe('UploadsComponent', () => {
  let component: UploadsComponent;
  let fixture: ComponentFixture<UploadsComponent>;
  let http: jasmine.SpyObj<HttpClient>;
  let swalFire: jasmine.Spy;

  beforeEach(() => {
    swalFire = jasmine.createSpy('fire');
    (window as any).Swal = { fire: swalFire };
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['get', 'post']);
    http.get.and.returnValue(of({
      codes: [
        { code: 'P28', description: 'Dimensions available' },
        { code: 'P29', description: 'Tolerance check' },
        { code: 'P30', description: 'Geometrical tolerance check' }
      ],
      feedback_ready: true
    }) as any);
    http.post.and.returnValue(of({ predictions: [] }) as any);
    TestBed.configureTestingModule({
      declarations: [UploadsComponent],
      imports: [FormsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: HttpClient, useValue: http },
        { provide: AuthService, useValue: { getAccessType: () => 'Employee', hasApiToken: () => true } },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } }
      ]
    });
    fixture = TestBed.createComponent(UploadsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => delete (window as any).Swal);

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps the classifier code when selected and marks a different code as corrected', () => {
    component.reviewRows = [{
      comment: 'Dimension is missing', classifierCode: 'P28', finalCode: 'P28',
      reviewStatus: 'kept_classifier', removed: false
    }];
    component.updateFinalCode(0, 'P28');
    expect(component.reviewRows[0].finalCode).toBe('P28');
    expect(component.reviewRows[0].reviewStatus).toBe('kept_classifier');
    component.updateFinalCode(0, 'P30');
    expect(component.reviewRows[0].classifierCode).toBe('P28');
    expect(component.reviewRows[0].finalCode).toBe('P30');
    expect(component.reviewRows[0].reviewStatus).toBe('corrected');
  });

  it('does not render a redundant accept-prediction action', () => {
    component.reviewRows = [{
      comment: 'Dimension is missing', classifierCode: 'P28', finalCode: 'P28',
      reviewStatus: 'kept_classifier', removed: false
    }];
    component.showCodeList = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('select[name="finalCode0"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('Accept prediction');
  });

  it('marks a comment for further review when no final code is selected', () => {
    component.reviewRows = [{
      comment: 'Vague request', classifierCode: 'P28', finalCode: 'P28',
      reviewStatus: 'needs_review', removed: false
    }];
    component.updateFinalCode(0, '');
    expect(component.reviewRows[0].finalCode).toBe('');
    expect(component.reviewRows[0].reviewStatus).toBe('needs_review');
  });

  it('hides review action buttons only after the backend confirms submission', () => {
    component.selectedFile = new File(['pdf'], 'drawing.pdf', { type: 'application/pdf' });
    component.feedbackReady = true;
    const response = new Subject<any>();
    http.post.and.returnValue(response.asObservable() as any);
    const form = { value: { comments: '' }, resetForm: jasmine.createSpy('resetForm') } as any;

    component.onSubmit(form);
    fixture.detectChanges();
    expect(component.submissionSucceeded).toBeFalse();
    expect(fixture.nativeElement.querySelector('.submit-container')).toBeTruthy();

    response.next({ drawing_id: 'DR-1', revision: 1 });
    fixture.detectChanges();
    response.complete();

    expect(component.submissionSucceeded).toBeTrue();
    expect(form.resetForm).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.submit-container')).toBeNull();
  });

  it('keeps review action buttons available when submission fails', () => {
    component.selectedFile = new File(['pdf'], 'drawing.pdf', { type: 'application/pdf' });
    component.feedbackReady = true;
    http.post.and.returnValue(throwError(() => ({ status: 500, error: { message: 'temporary failure' } })) as any);
    const form = { value: { comments: '' }, resetForm: jasmine.createSpy('resetForm') } as any;

    component.onSubmit(form);
    fixture.detectChanges();

    expect(component.submissionSucceeded).toBeFalse();
    expect(component.isSubmitting).toBeFalse();
    expect(fixture.nativeElement.querySelector('.submit-container')).toBeTruthy();
    expect(form.resetForm).not.toHaveBeenCalled();
  });

  it('paginates the complete feedback history in groups of ten', () => {
    component.feedbackHistory = Array.from({ length: 23 }, (_, index) => ({
      comment: `Comment ${index + 1}`,
      classifier_prediction: 'P28',
      final_code: 'P28',
      review_decision: 'kept_classifier',
      reviewed_at: null
    }));

    expect(component.feedbackHistoryPageSize).toBe(10);
    expect(component.pagedFeedbackHistory.length).toBe(10);
    expect(component.feedbackHistoryTotalPages).toBe(3);
    component.nextFeedbackHistoryPage();
    expect(component.feedbackHistoryPage).toBe(2);
    expect(component.pagedFeedbackHistory[0].comment).toBe('Comment 11');
    component.nextFeedbackHistoryPage();
    expect(component.pagedFeedbackHistory.length).toBe(3);
    component.nextFeedbackHistoryPage();
    expect(component.feedbackHistoryPage).toBe(3);
    component.previousFeedbackHistoryPage();
    expect(component.feedbackHistoryPage).toBe(2);
  });

  it('resets feedback history pagination when history is refreshed', () => {
    component.feedbackHistoryPage = 3;
    http.get.and.returnValue(of({ feedback: [] }) as any);
    (component as any).loadFeedbackHistory('DRAWING-1', 2);
    expect(component.feedbackHistoryPage).toBe(1);
    expect(component.feedbackHistory).toEqual([]);
  });
});
