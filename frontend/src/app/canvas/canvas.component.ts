import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  HostListener,
  OnInit
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import * as pdfjsLib from 'pdfjs-dist';
import { environment } from 'src/environments/environment';
import { AuthService } from '../auth.service';

type CanvasMode = 'view' | 'add-text' | 'select' | 'add-stamp';

export interface Annotation {
  id: string;
  documentId: string;
  page: number;
  x: number;
  y: number;
  text: string;
  createdAt?: string;
  updatedAt?: string;
  color?: string;
  fontSize?: number;
  type?: 'text' | 'stamp';
  stampType?: 'reviewed' | 'correct' | 'wrong';
  reviewDate?: string;
  reviewerName?: string;
}

@Component({
  selector: 'app-canvas',
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.scss']
})
export class CanvasComponent implements AfterViewInit, OnInit {
  // PDF canvas
  @ViewChild('pdfCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  // Annotation overlay layer
  @ViewChild('annotationLayer') annotationLayerRef!: ElementRef<HTMLDivElement>;
  // Floating text editor
  @ViewChild('textInput') textInputRef!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  private readonly API = `${environment.apiUrl}`;

  // Header info (no created/last reviewed per your request)
  drawingNumber = '';
  revisionNumber = 0;
  creatorName = '';
  creatorId = '';
  // PDF rendering state
  pdfDoc: any = null;
  pageNum = 1;
  totalPages = 0;
  scale = 1;
  currentPdfFile: File | null = null;

  // Annotation state
  annotations: Annotation[] = [];
  selectedAnnotationId: string | null = null;
  mode: CanvasMode = 'view';

  // Inline editor state
  isEditingText = false;
  editingAnnotationId: string | null = null;
  textInputPosition = { x: 0, y: 0 };
  textInputValue = '';

  // Styles
  textColor = '#000000';
  fontSize = 16;

  // Stamp properties
  selectedStampType: 'reviewed' | 'correct' | 'wrong' = 'reviewed';

  // Dragging state
  private isDragging = false;
  private dragAnnotationId: string | null = null;
  private dragOffset = { x: 0, y: 0 }; // normalized offset

  // HUD
  statusMessage = '';
  showStatusMessage = false;

  // Internal
  private pdfContext!: CanvasRenderingContext2D;
  // Canvas dimensions (updated after each render to trigger annotation repositioning)
  canvasWidth = 0;
  canvasHeight = 0;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private http: HttpClient,
    private authService: AuthService
  ) {
    // PDF.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Init & PDF loading
  // ───────────────────────────────────────────────────────────────────────────
  async ngAfterViewInit(): Promise<void> {
    this.pdfContext = this.canvasRef.nativeElement.getContext('2d')!;

    const st: any = history.state || {};
    if (st.drawingId) this.drawingNumber = st.drawingId;
    if (st.drawingNo) this.drawingNumber = st.drawingNo;
    if (st.revision !== undefined) this.revisionNumber = Number(st.revision);
    if (st.revisionNo !== undefined) this.revisionNumber = Number(st.revisionNo);
    if (st.creatorName) this.creatorName = st.creatorName;

    if (this.drawingNumber && this.revisionNumber) {
      await this.loadPdfFromApi(this.drawingNumber, this.revisionNumber);
    }

    this.route.queryParamMap.subscribe(async qp => {
      const qDrawing = qp.get('drawing_id');
      const qRev = qp.get('revision');
      const qCreator = qp.get('creatorName');

      if (qDrawing) this.drawingNumber = qDrawing;
      if (qRev) this.revisionNumber = Number(qRev);
      if (qCreator && !this.creatorName) this.creatorName = qCreator;

      if (this.drawingNumber && this.revisionNumber) {
        await this.loadPdfFromApi(this.drawingNumber, this.revisionNumber);
      } else if (!this.pdfDoc) {
        this.renderMockPage();
      }
    });
  }

  ngOnInit(): void {
    const nav = this.router.getCurrentNavigation()?.extras.state as any | undefined;
    const qp = this.route.snapshot.queryParamMap;
    const qpDrawingId = qp.get('drawing_id');
    const qpRevision = qp.get('revision');
    this.drawingNumber = nav?.drawingId ?? qpDrawingId ?? this.drawingNumber;
    this.revisionNumber = nav?.revision ?? (qpRevision ? Number(qpRevision) : this.revisionNumber);
    this.creatorId = nav?.creatorId ?? this.creatorId;
  }

  showStatusMessageFunc(message: string): void {
    this.statusMessage = message;
    this.showStatusMessage = true;
    setTimeout(() => {
      this.showStatusMessage = false;
    }, 3000);
  }

  private async loadPdfFromApi(drawingId: string, revision: number): Promise<void> {
    const url = `${this.API}/drawings/${encodeURIComponent(drawingId)}/${revision}/pdf/view`;
    try {
      const buffer = await firstValueFrom(
        this.http.get(url, { responseType: 'arraybuffer' })
      );
      const bytes = new Uint8Array(buffer);
      this.pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
      this.totalPages = this.pdfDoc.numPages;
      this.pageNum = 1;
      await this.renderPage(this.pageNum);
      this.toast('Loaded PDF from server.');
    } catch (err) {
      console.error('Failed to load PDF from API', err);
      this.renderMockPage();
      this.toast('Could not load PDF from server.');
    }
  }



  async renderPage(num: number): Promise<void> {
    if (!this.pdfDoc) {
      this.renderMockPage();
      return;
    }

    try {
      const page = await this.pdfDoc.getPage(num);
      const viewport = page.getViewport({ scale: this.scale });

      const canvas = this.canvasRef.nativeElement;
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: this.pdfContext, viewport }).promise;

      // Resize overlay to match canvas and update stored dimensions for annotation positioning
      const layer = this.annotationLayerRef?.nativeElement;
      if (layer) {
        layer.style.width = `${viewport.width}px`;
        layer.style.height = `${viewport.height}px`;
      }
      // Update stored dimensions so Angular CD repositions all annotations
      this.canvasWidth = viewport.width;
      this.canvasHeight = viewport.height;
    } catch (e) {
      console.error('Error rendering PDF page:', e);
      this.renderMockPage();
    }
  }

  private renderMockPage(): void {
    const pdfCanvas = this.canvasRef.nativeElement;
    const W = 600 * this.scale;
    const H = 800 * this.scale;
    pdfCanvas.width = W;
    pdfCanvas.height = H;

    this.pdfContext.fillStyle = '#fff';
    this.pdfContext.fillRect(0, 0, W, H);
    this.pdfContext.fillStyle = '#000';
    this.pdfContext.font = `${18 * this.scale}px Arial`;
    this.pdfContext.fillText('No PDF – showing mock page', 40 * this.scale, 60 * this.scale);

    const layer = this.annotationLayerRef?.nativeElement;
    if (layer) {
      layer.style.width = `${W}px`;
      layer.style.height = `${H}px`;
    }
    this.canvasWidth = W;
    this.canvasHeight = H;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Mode switching & PDF clicks
  // ───────────────────────────────────────────────────────────────────────────
  setMode(m: CanvasMode): void {
    this.mode = m;
    this.selectedAnnotationId = null;
    this.isEditingText = false;
    this.editingAnnotationId = null;
  }

  setStampType(type: 'reviewed' | 'correct' | 'wrong'): void {
    this.selectedStampType = type;
  }

  onPdfClick(event: MouseEvent): void {
    // Only proceed if in add-text or add-stamp mode
    if (this.mode !== 'add-text' && this.mode !== 'add-stamp') {
      return;
    }
    const target = event.target as HTMLElement;
    if (target.classList.contains('annotation')) {
      return;
    }
    event.stopPropagation();

    const layer = this.annotationLayerRef?.nativeElement;
    if (!layer) return;

    const rect = layer.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const normalizedX = clickX / rect.width;
    const normalizedY = clickY / rect.height;

    if (this.mode === 'add-stamp') {
      // Add a stamp annotation
      this.addStampAnnotation(normalizedX, normalizedY);
    } else {
      // Add a text annotation (existing behavior)
      this.addTextAnnotation(normalizedX, normalizedY, clickX, clickY);
    }
  }

  private addStampAnnotation(normalizedX: number, normalizedY: number): void {
    const now = new Date();
    const dateStr = now.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    const stamp: Annotation = {
      id: this.generateId(),
      documentId: this.drawingNumber,
      page: this.pageNum,
      x: normalizedX,
      y: normalizedY,
      text: '',
      type: 'stamp',
      stampType: this.selectedStampType,
      reviewDate: dateStr,
      reviewerName: this.authService.getLoggedInUserFullName() || 'Unknown',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.annotations.push(stamp);
    this.toast(`${this.selectedStampType.toUpperCase()} stamp added.`);
  }

  private addTextAnnotation(normalizedX: number, normalizedY: number, clickX: number, clickY: number): void {
    const newAnnotation: Annotation = {
      id: this.generateId(),
      documentId: this.drawingNumber,
      page: this.pageNum,
      x: normalizedX,
      y: normalizedY,
      text: '',
      type: 'text',
      color: this.textColor,
      fontSize: this.fontSize,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.annotations.push(newAnnotation);
    this.selectedAnnotationId = newAnnotation.id;

    this.textInputPosition = { x: clickX, y: clickY };
    this.textInputValue = '';
    this.isEditingText = true;
    this.editingAnnotationId = newAnnotation.id;

    setTimeout(() => {
      this.textInputRef?.nativeElement.focus();
    }, 0);
  }

  onTextInputChange(): void {
    if (this.editingAnnotationId) {
      this.annotations = this.annotations.map(a =>
        a.id === this.editingAnnotationId ? { ...a, text: this.textInputValue } : a
      );
    }
  }

  finishTextEditing(): void {
    if (this.editingAnnotationId && this.textInputValue.trim() === '') {
      this.annotations = this.annotations.filter(a => a.id !== this.editingAnnotationId);
    }
    this.isEditingText = false;
    this.editingAnnotationId = null;
    this.textInputValue = '';
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Annotation selection & deletion
  // ───────────────────────────────────────────────────────────────────────────
  onAnnotationClick(annotation: Annotation, event: MouseEvent): void {
    event.stopPropagation();
    if (this.mode === 'select') {
      this.selectedAnnotationId = annotation.id;
    } else if (this.mode === 'add-text' && annotation.type === 'text') {
      this.selectedAnnotationId = annotation.id;
      const layer = this.annotationLayerRef?.nativeElement;
      if (!layer) return;
      const rect = layer.getBoundingClientRect();
      const left = annotation.x * rect.width;
      const top = annotation.y * rect.height;
      this.textInputPosition = { x: left, y: top };
      this.textInputValue = annotation.text;
      this.isEditingText = true;
      this.editingAnnotationId = annotation.id;
      setTimeout(() => this.textInputRef?.nativeElement.focus(), 0);
    }
  }

  onAnnotationMouseDown(annotation: Annotation, event: MouseEvent): void {
    if (this.mode !== 'select') return;
    event.preventDefault();
    event.stopPropagation();
    const layer = this.annotationLayerRef?.nativeElement;
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    const xNorm = (event.clientX - rect.left) / rect.width;
    const yNorm = (event.clientY - rect.top) / rect.height;
    this.dragOffset.x = xNorm - annotation.x;
    this.dragOffset.y = yNorm - annotation.y;
    this.isDragging = true;
    this.dragAnnotationId = annotation.id;
    this.selectedAnnotationId = annotation.id;
  }

  deleteSelected(): void {
    if (this.selectedAnnotationId) {
      this.annotations = this.annotations.filter(a => a.id !== this.selectedAnnotationId);
      this.selectedAnnotationId = null;
      this.toast('Annotation deleted.');
    } else {
      this.toast('No annotation selected.');
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Zoom & navigation
  // ───────────────────────────────────────────────────────────────────────────
  async zoomIn(): Promise<void> {
    this.scale = Math.min(this.scale + 0.2, 3);
    await this.renderPage(this.pageNum);
  }

  async zoomOut(): Promise<void> {
    this.scale = Math.max(this.scale - 0.2, 0.4);
    await this.renderPage(this.pageNum);
  }

  async previousPage(): Promise<void> {
    if (this.pageNum <= 1) return;
    this.pageNum--;
    await this.renderPage(this.pageNum);
  }

  async nextPage(): Promise<void> {
    if (this.pageNum >= this.totalPages) return;
    this.pageNum++;
    await this.renderPage(this.pageNum);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Text style
  // ───────────────────────────────────────────────────────────────────────────
  setColor(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.textColor = input.value;
  }

  setFontSize(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.fontSize = Number(select.value);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // File upload
  // ───────────────────────────────────────────────────────────────────────────
  openFileSelector(): void {
    this.fileInputRef?.nativeElement.click();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.currentPdfFile = file;
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    this.pdfDoc = await loadingTask.promise;
    this.totalPages = this.pdfDoc.numPages;
    this.pageNum = 1;
    await this.renderPage(this.pageNum);
    this.toast('PDF uploaded and loaded.');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Positioning helper
  // ───────────────────────────────────────────────────────────────────────────
  getAnnotationStyle(a: Annotation): any {
    // Use stored canvas dimensions so Angular re-renders annotations on zoom changes
    const w = this.canvasWidth;
    const h = this.canvasHeight;
    if (!w || !h) {
      return {};
    }
    const left = a.x * w;
    const top = a.y * h;
    const isSelected = a.id === this.selectedAnnotationId;

    // Different styling for stamps vs text annotations
    if (a.type === 'stamp') {
      return {
        left: `${left}px`,
        top: `${top}px`,
        transform: `scale(${this.scale})`,
        transformOrigin: 'top left',
        border: isSelected ? '2px solid #0ea5e9' : 'none'
      };
    } else {
      // Text annotation styling — scale font size with zoom
      const color = a.color ?? this.textColor;
      const baseFontSize = a.fontSize ?? this.fontSize;
      return {
        left: `${left}px`,
        top: `${top}px`,
        fontSize: `${baseFontSize * this.scale}px`,
        color,
        border: isSelected ? '1px solid #0ea5e9' : '1px solid transparent'
      };
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Backend-based annotation persistence (bulk per document)
  // ───────────────────────────────────────────────────────────────────────────
  async saveAnnotations(): Promise<void> {
    if (!this.drawingNumber) {
      this.toast('Missing drawing number.');
      return;
    }
    try {
      const url = `${this.API}/annotations/${encodeURIComponent(this.drawingNumber)}`;
      await firstValueFrom(
        this.http.post(url, {
          documentId: this.drawingNumber,
          annotations: this.annotations
        })
      );
      this.toast('Annotations saved.');
    } catch (err) {
      console.error('Failed to save annotations', err);
      this.toast('Failed to save annotations.');
    }
  }

  async loadAnnotations(): Promise<void> {
    if (!this.drawingNumber) {
      this.toast('Missing drawing number.');
      return;
    }
    try {
      const url = `${this.API}/annotations/${encodeURIComponent(this.drawingNumber)}`;
      const res: any = await firstValueFrom(this.http.get(url));
      const loaded: Annotation[] = res?.annotations ?? res ?? [];
      // Keep all annotations for the document; rendering is page-specific
      this.annotations = loaded;
      this.selectedAnnotationId = null;
      this.isEditingText = false;
      this.editingAnnotationId = null;
      this.toast('Annotations loaded.');
    } catch (err) {
      console.error('Failed to load annotations', err);
      this.toast('Failed to load annotations.');
    }
  }

  clearAnnotations(): void {
    this.annotations = [];
    this.selectedAnnotationId = null;
    this.isEditingText = false;
    this.editingAnnotationId = null;
    this.toast('Annotations cleared.');
  }

  // Ask backend to generate a PDF that has *real* PDF annotations
  // (so tools like fitz page.annots() can extract them), without
  // mutating the stored original.
  async downloadAnnotatedImage(): Promise<void> {
    if (!this.drawingNumber || !this.revisionNumber) {
      this.toast('Missing drawing number or revision.');
      return;
    }

    try {
      const url = `${this.API}/drawings/${encodeURIComponent(
        this.drawingNumber
      )}/${this.revisionNumber}/pdf/annotated/download`;

      const blob = await firstValueFrom(
        this.http.post(url, { annotations: this.annotations }, { responseType: 'blob' })
      );

      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const baseName = this.drawingNumber || 'annotated-document';
      a.download = `${baseName}_annotated.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);

      this.toast('Annotated PDF downloaded.');
    } catch (err) {
      console.error('Failed to download annotated PDF', err);
      this.toast('Failed to download annotated PDF.');
    }
  }

  // Convenience getter: annotations only for the currently visible page
  get pageAnnotations(): Annotation[] {
    return this.annotations.filter(a => a.page === this.pageNum);
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent): void {
    if (!this.isDragging || !this.dragAnnotationId) {
      return;
    }
    const layer = this.annotationLayerRef?.nativeElement;
    if (!layer) {
      return;
    }
    const rect = layer.getBoundingClientRect();
    const xNorm = (event.clientX - rect.left) / rect.width;
    const yNorm = (event.clientY - rect.top) / rect.height;

    const newX = Math.min(1, Math.max(0, xNorm - this.dragOffset.x));
    const newY = Math.min(1, Math.max(0, yNorm - this.dragOffset.y));

    this.annotations = this.annotations.map(a =>
      a.id === this.dragAnnotationId ? { ...a, x: newX, y: newY } : a
    );
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    this.isDragging = false;
    this.dragAnnotationId = null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Error Mapping → Uploads (prefill)
  // ───────────────────────────────────────────────────────────────────────────
  async goToErrorMapping(): Promise<void> {
    if (!this.drawingNumber || !this.revisionNumber) {
      this.toast('Missing drawing number or revision.');
      this.router.navigate(['/uploads']);
      return;
    }

    try {
      this.toast('Saving annotations and PDF...');
      await this.saveAnnotations();
      const annotatedPdfBlob = await this.generateAnnotatedPdfBlob();
      await this.saveAnnotatedPdfToDatabase(annotatedPdfBlob);
      this.router.navigate(['/uploads'], {
        queryParams: {
          drawing_id: this.drawingNumber,
          revision: this.revisionNumber
        }
      });
      this.toast('Redirecting to uploads page...');
    } catch (err) {
      console.error('Failed to save annotated PDF', err);
      this.toast('Failed to save PDF. Redirecting anyway...');
      this.router.navigate(['/uploads'], {
        queryParams: {
          drawing_id: this.drawingNumber,
          revision: this.revisionNumber
        }
      });
    }
  }

  /**
   * Generate annotated PDF blob by calling backend API
   * This creates a temporary annotated version without mutating the stored original
   */
  private async generateAnnotatedPdfBlob(): Promise<Blob> {
    if (!this.drawingNumber || !this.revisionNumber) {
      throw new Error('Missing drawing number or revision.');
    }

    const url = `${this.API}/drawings/${encodeURIComponent(
      this.drawingNumber
    )}/${this.revisionNumber}/pdf/annotated/download`;

    const blob = await firstValueFrom(
      this.http.post(url, { annotations: this.annotations }, { responseType: 'blob' })
    );

    return blob;
  }

  /**
   * Save the annotated PDF to the database, replacing the original
   */
  private async saveAnnotatedPdfToDatabase(annotatedPdfBlob: Blob): Promise<void> {
    const url = `${this.API}/drawings/${encodeURIComponent(
      this.drawingNumber
    )}/${this.revisionNumber}/pdf/annotated/upload`;

    const revisionStr = String(this.revisionNumber).padStart(2, '0');
    const filename = `${this.drawingNumber}-${revisionStr}.pdf`;

    const formData = new FormData();
    formData.append('file', annotatedPdfBlob, filename);

    await firstValueFrom(
      this.http.post(url, formData)
    );

    this.toast('Annotated PDF saved to database');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Utils
  // ───────────────────────────────────────────────────────────────────────────
  private toast(msg: string): void {
    this.statusMessage = msg;
    this.showStatusMessage = true;
    setTimeout(() => (this.showStatusMessage = false), 3000);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  }
}
