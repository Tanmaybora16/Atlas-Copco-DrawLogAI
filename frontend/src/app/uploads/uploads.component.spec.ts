import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of } from 'rxjs';
import { UploadsComponent } from './uploads.component';
import { AuthService } from '../auth.service';

describe('UploadsComponent', () => {
  let component: UploadsComponent;
  let fixture: ComponentFixture<UploadsComponent>;
  let http: jasmine.SpyObj<HttpClient>;

  beforeEach(() => {
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

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('accepts the existing classifier prediction as the reviewer final code', () => {
    component.reviewRows = [{
      comment: 'Dimension is missing', classifierCode: 'P28', finalCode: '',
      reviewStatus: 'needs_review', removed: false
    }];
    component.acceptClassifierPrediction(0);
    expect(component.reviewRows[0].finalCode).toBe('P28');
    expect(component.reviewRows[0].reviewStatus).toBe('kept_classifier');
  });

  it('keeps a reviewer correction separate from the original classifier value', () => {
    component.reviewRows = [{
      comment: 'Dimension is missing', classifierCode: 'P28', finalCode: 'P28',
      reviewStatus: 'kept_classifier', removed: false
    }];
    component.updateFinalCode(0, 'P30');
    expect(component.reviewRows[0].classifierCode).toBe('P28');
    expect(component.reviewRows[0].finalCode).toBe('P30');
    expect(component.reviewRows[0].reviewStatus).toBe('corrected');
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
});
