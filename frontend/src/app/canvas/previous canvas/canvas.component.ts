// canvas.component.ts
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
 
type CanvasMode = 'view' | 'add-text' | 'select';
 
/**
 * A lightweight text annotation that is always stored in
 * page‑relative, normalized coordinates so it stays aligned
 * when the PDF is zoomed or resized.
 */
export interface Annotation {
  id: string;
  documentId: string;
  page: number;
  /** 0–1 relative to page width */
  x: number;
  /** 0–1 relative to page height */
  y: number;
  text: string;
  createdAt?: string;
  updatedAt?: string;
  color?: string;
  fontSize?: number;
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

  // Dragging state
  private isDragging = false;
  private dragAnnotationId: string | null = null;
  private dragOffset = { x: 0, y: 0 }; // normalized offset

  // HUD
  statusMessage = '';
  showStatusMessage = false;

  // Internal
  private pdfContext!: CanvasRenderingContext2D;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private http: HttpClient
  ) {
    // PDF.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Init & PDF loading
  // ───────────────────────────────────────────────────────────────────────────
  async ngAfterViewInit(): Promise<void> {
    // Grab contexts
    this.pdfContext = this.canvasRef.nativeElement.getContext('2d')!;

    // 1) From navigation state
    const st: any = history.state || {};
    if (st.drawingId) this.drawingNumber = st.drawingId;
    if (st.drawingNo) this.drawingNumber = st.drawingNo;
    if (st.revision !== undefined) this.revisionNumber = Number(st.revision);
    if (st.revisionNo !== undefined) this.revisionNumber = Number(st.revisionNo);
    if (st.creatorName) this.creatorName = st.creatorName;

    // If state already has what we need, try loading immediately
    if (this.drawingNumber && this.revisionNumber) {
      console.log('Canvas ngAfterViewInit - Loading PDF:', this.drawingNumber, 'Rev:', this.revisionNumber);
      await this.loadPdfFromApi(this.drawingNumber, this.revisionNumber);
    }

    // 2) Also listen to query params (direct links)
    this.route.queryParamMap.subscribe(async qp => {
      const qDrawing = qp.get('drawing_id');
      const qRev = qp.get('revision');
      const qCreator = qp.get('creatorName');

      if (qDrawing) this.drawingNumber = qDrawing;
      if (qRev) this.revisionNumber = Number(qRev);
      if (qCreator && !this.creatorName) this.creatorName = qCreator;

      if (this.drawingNumber && this.revisionNumber) {
        console.log('Canvas queryParams - Loading PDF:', this.drawingNumber, 'Rev:', this.revisionNumber);
        await this.loadPdfFromApi(this.drawingNumber, this.revisionNumber);
      } else if (!this.pdfDoc) {
        this.renderMockPage();
      }
    });
  }

  ngOnInit(): void {
    const nav = this.router.getCurrentNavigation()?.extras.state as any | undefined;
 
    // Fallbacks if user reloads the page or arrives via URL
    const qp = this.route.snapshot.queryParamMap;
    const qpDrawingId = qp.get('drawing_id');
    const qpRevision = qp.get('revision');
 
    this.drawingNumber = nav?.drawingId ?? qpDrawingId ?? this.drawingNumber;
    // Ensure revision is parsed as a number
    this.revisionNumber = nav?.revision ?? (qpRevision ? Number(qpRevision) : this.revisionNumber);
    this.creatorId = nav?.creatorId ?? this.creatorId;
    
    console.log('Canvas ngOnInit - Drawing:', this.drawingNumber, 'Revision:', this.revisionNumber);
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
 
      // Resize overlay to match canvas
      const layer = this.annotationLayerRef?.nativeElement;
      if (layer) {
        layer.style.width = `${viewport.width}px`;
        layer.style.height = `${viewport.height}px`;
      }
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
  }
 
  // ───────────────────────────────────────────────────────────────────────────
  // Pagination / Zoom
  // ───────────────────────────────────────────────────────────────────────────
  previousPage(): void {
    if (this.pageNum <= 1) return;
    this.pageNum--;
    this.renderPage(this.pageNum);
    // Reset editing/selection when page changes
    this.selectedAnnotationId = null;
    this.isEditingText = false;
    this.editingAnnotationId = null;
    this.isDragging = false;
    this.dragAnnotationId = null;
  }

  nextPage(): void {
    if (this.pageNum >= this.totalPages) return;
    this.pageNum++;
    this.renderPage(this.pageNum);
    // Reset editing/selection when page changes
    this.selectedAnnotationId = null;
    this.isEditingText = false;
    this.editingAnnotationId = null;
    this.isDragging = false;
    this.dragAnnotationId = null;
  }

  zoomIn(): void {
    this.scale = Math.min(this.scale + 0.25, 5);
    this.renderPage(this.pageNum);
  }

  zoomOut(): void {
    this.scale = Math.max(this.scale - 0.25, 0.5);
    this.renderPage(this.pageNum);
  }

  @HostListener('wheel', ['$event'])
  onWheel(e: WheelEvent): void {
    if (!e.ctrlKey) return;
    e.preventDefault();
    e.deltaY < 0 ? this.zoomIn() : this.zoomOut();
  }
 
  // ───────────────────────────────────────────────────────────────────────────
  // File input (manual upload to *view* new PDF locally)
  // ───────────────────────────────────────────────────────────────────────────
  onFileSelected(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length) this.loadPdfFile(input.files[0]);
  }
  openFileSelector(): void { this.fileInputRef.nativeElement.click(); }

  private async loadPdfFile(file: File): Promise<void> {
    this.currentPdfFile = file;
    const fileReader = new FileReader();
    fileReader.onload = async (e) => {
      const typedArray = new Uint8Array(e.target!.result as ArrayBuffer);
      try {
        this.pdfDoc = await pdfjsLib.getDocument(typedArray).promise;
        this.totalPages = this.pdfDoc.numPages;
        this.pageNum = 1;
        this.scale = 1.5;
        await this.renderPage(this.pageNum);
        this.showStatusMessageFunc('PDF loaded successfully!');
      } catch (error) {
        console.error('Error loading PDF file:', error);
        this.showStatusMessageFunc('Error loading PDF file');
        this.renderMockPage();
      }
    };
    fileReader.readAsArrayBuffer(file);
  }
 
  // ───────────────────────────────────────────────────────────────────────────
  // Annotation tools and interaction
  // ───────────────────────────────────────────────────────────────────────────
  setMode(mode: CanvasMode): void {
    this.mode = mode;
    if (mode !== 'add-text' && this.isEditingText) {
      this.finishTextEditing();
    }
  }
 
  setColor(e: Event): void {
    const val = (e.target as HTMLInputElement).value;
    this.textColor = val;

    if (this.selectedAnnotationId) {
      this.annotations = this.annotations.map(a =>
        a.id === this.selectedAnnotationId ? { ...a, color: val } : a
      );
    }
  }
 
  setFontSize(e: Event): void {
    const val = parseInt((e.target as HTMLSelectElement).value, 10);
    if (!isNaN(val)) {
      this.fontSize = val;

      if (this.selectedAnnotationId) {
        this.annotations = this.annotations.map(a =>
          a.id === this.selectedAnnotationId ? { ...a, fontSize: val } : a
        );
      }
    }
  }
 
  onPdfClick(event: MouseEvent): void {
    if (this.mode !== 'add-text') {
      return;
    }
    const layer = this.annotationLayerRef.nativeElement;
    const rect = layer.getBoundingClientRect();
    const xNorm = (event.clientX - rect.left) / rect.width;
    const yNorm = (event.clientY - rect.top) / rect.height;
 
    const id = this.generateId();
    const annotation: Annotation = {
      id,
      documentId: this.drawingNumber,
      page: this.pageNum,
      x: xNorm,
      y: yNorm,
      text: 'New comment',
      color: this.textColor,
      fontSize: this.fontSize
    };
    this.annotations = [...this.annotations, annotation];
    this.startTextEditing(annotation, layer);
  }
 
  onAnnotationClick(annotation: Annotation, event: MouseEvent): void {
    event.stopPropagation();
    this.selectedAnnotationId = annotation.id;
    if (this.mode === 'add-text' || this.mode === 'select') {
      const layer = this.annotationLayerRef.nativeElement;
      this.startTextEditing(annotation, layer);
    }
  }

  onAnnotationMouseDown(annotation: Annotation, event: MouseEvent): void {
    if (this.mode !== 'select') {
      return;
    }
    event.stopPropagation();
    const layer = this.annotationLayerRef.nativeElement;
    const rect = layer.getBoundingClientRect();
    const xNorm = (event.clientX - rect.left) / rect.width;
    const yNorm = (event.clientY - rect.top) / rect.height;

    this.selectedAnnotationId = annotation.id;
    this.isDragging = true;
    this.dragAnnotationId = annotation.id;
    this.dragOffset = {
      x: xNorm - annotation.x,
      y: yNorm - annotation.y
    };
  }
 
  deleteSelected(): void {
    if (!this.selectedAnnotationId) return;
    this.annotations = this.annotations.filter(a => a.id !== this.selectedAnnotationId);
    this.selectedAnnotationId = null;
    this.isEditingText = false;
    this.editingAnnotationId = null;
  }
 
  private startTextEditing(annotation: Annotation, layer: HTMLElement): void {
    this.isEditingText = true;
    this.editingAnnotationId = annotation.id;
    this.textInputValue = annotation.text;
 
    const leftPx = annotation.x * layer.clientWidth;
    const topPx = annotation.y * layer.clientHeight;
    this.textInputPosition = { x: leftPx, y: topPx };
 
    setTimeout(() => {
      this.textInputRef?.nativeElement?.focus();
      this.textInputRef?.nativeElement?.select();
    }, 0);
  }
 
  onTextInputChange(): void {
    if (!this.editingAnnotationId) return;
    this.annotations = this.annotations.map(a =>
      a.id === this.editingAnnotationId ? { ...a, text: this.textInputValue } : a
    );
  }
 
  finishTextEditing(): void {
    if (this.isEditingText) {
      this.onTextInputChange();
    }
    this.isEditingText = false;
    this.editingAnnotationId = null;
  }
 
  getAnnotationStyle(a: Annotation): { [key: string]: string } {
    const layer = this.annotationLayerRef?.nativeElement;
    const width = layer?.clientWidth ?? 0;
    const height = layer?.clientHeight ?? 0;
    const left = a.x * width;
    const top = a.y * height;
    const isSelected = a.id === this.selectedAnnotationId;
    const color = a.color ?? this.textColor;
    const fontSize = a.fontSize ?? this.fontSize;
    return {
      left: `${left}px`,
      top: `${top}px`,
      fontSize: `${fontSize}px`,
      color,
      border: isSelected ? '1px solid #0ea5e9' : '1px solid transparent'
    };
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
    console.log('goToErrorMapping called - Drawing:', this.drawingNumber, 'Revision:', this.revisionNumber);
    
    if (!this.drawingNumber || !this.revisionNumber) {
      this.toast('Missing drawing number or revision.');
      this.router.navigate(['/uploads']);
      return;
    }

    try {
      this.toast('Saving annotations and PDF...');

      // Step 1: Save annotations to backend
      await this.saveAnnotations();

      // Step 2: Generate annotated PDF blob
      const annotatedPdfBlob = await this.generateAnnotatedPdfBlob();
      
      // Step 3: SAVE the annotated PDF to the database (overwrite original)
      await this.saveAnnotatedPdfToDatabase(annotatedPdfBlob);

      // Step 4: Navigate to uploads page (now with updated PDF in database)
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
      
      // Fallback: navigate without saving
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
    
    // Format revision number as 2-digit string (e.g., "01", "02", etc.)
    const revisionStr = String(this.revisionNumber).padStart(2, '0');
    const filename = `${this.drawingNumber}-${revisionStr}.pdf`;
    
    console.log('Saving annotated PDF:', filename, 'Drawing:', this.drawingNumber, 'Revision:', this.revisionNumber);
    
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
