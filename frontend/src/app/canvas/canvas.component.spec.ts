import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CanvasComponent, Annotation } from './canvas.component';

describe('CanvasComponent', () => {
  let component: CanvasComponent;
  let fixture: ComponentFixture<CanvasComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [CanvasComponent],
      imports: [HttpClientTestingModule, RouterTestingModule, FormsModule]
    });
    fixture = TestBed.createComponent(CanvasComponent);
    component = fixture.componentInstance;
    // Avoid running real PDF loading in tests
    (component as any).pdfDoc = null;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should add a new annotation in add-text mode on click', () => {
    component.mode = 'add-text';
    // Mock layer sizes so normalized coords work
    (component as any).annotationLayerRef = {
      nativeElement: {
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          width: 200,
          height: 200
        })
      }
    };

    const event = new MouseEvent('click', { clientX: 100, clientY: 100 });
    component.onPdfClick(event);

    expect(component.annotations.length).toBe(1);
    const ann = component.annotations[0];
    expect(ann.page).toBe(component.pageNum);
    expect(ann.text).toBe('New comment');
  });

  it('should update only selected annotation color and font size', () => {
    const a1: Annotation = {
      id: '1',
      documentId: 'DR_X',
      page: 1,
      x: 0.1,
      y: 0.1,
      text: 'first'
    };
    const a2: Annotation = {
      id: '2',
      documentId: 'DR_X',
      page: 1,
      x: 0.2,
      y: 0.2,
      text: 'second'
    };
    component.annotations = [a1, a2];
    component.selectedAnnotationId = '2';

    const colorEvent = { target: { value: '#ff0000' } } as any;
    component.setColor(colorEvent);
    const sizeEvent = { target: { value: '20' } } as any;
    component.setFontSize(sizeEvent);

    const updated = component.annotations.find(a => a.id === '2')!;
    const untouched = component.annotations.find(a => a.id === '1')!;

    expect(updated.color).toBe('#ff0000');
    expect(updated.fontSize).toBe(20);
    expect(untouched.color).toBeUndefined();
    expect(untouched.fontSize).toBeUndefined();
  });

  it('should update annotation position while dragging', () => {
    const ann: Annotation = {
      id: 'drag',
      documentId: 'DR_X',
      page: 1,
      x: 0.1,
      y: 0.1,
      text: 'drag me'
    };
    component.annotations = [ann];
    component.mode = 'select';
    (component as any).annotationLayerRef = {
      nativeElement: {
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          width: 200,
          height: 200
        })
      }
    };

    const downEvent = new MouseEvent('mousedown', { clientX: 20, clientY: 20 });
    component.onAnnotationMouseDown(ann, downEvent);

    const moveEvent = new MouseEvent('mousemove', { clientX: 40, clientY: 40 });
    component.onDocumentMouseMove(moveEvent);

    const updated = component.annotations[0];
    expect(updated.x).not.toBe(0.1);
    expect(updated.y).not.toBe(0.1);
  });

  it('should navigate to uploads with drawing_id and revision on goToErrorMapping', () => {
    const router = TestBed.inject(Router);
    const spy = spyOn(router, 'navigate');

    component.drawingNumber = 'DR_123';
    component.revisionNumber = 2;

    component.goToErrorMapping();

    expect(spy).toHaveBeenCalledWith(['/uploads'], {
      queryParams: {
        drawing_id: 'DR_123',
        revision: 2
      }
    });
  });
});
