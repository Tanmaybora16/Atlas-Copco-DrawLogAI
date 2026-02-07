import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../auth.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

declare const Swal: any;

type SortDir = 'asc' | 'desc' | '';

interface IncomingRow {
  // reviewer view row
  creatorName: string;
  id: string; // creator ID
  drawingNo: string;
  revisionNo: number;
  creatorEmail: string;
  createdDate: string;
  lastReviewedDate?: string | null;
  status: 'Review' | 'Reviewed';
}

interface OutgoingRow {
  // creator view row
  reviewerName: string;
  id: string; // reviewer ID
  drawingNo: string;
  revisionNo: number;
  reviewerEmail: string;
  createdDate: string;
  status: 'Pending' | 'Approved' | 'Rejected';
}

@Component({
  selector: 'app-requests',
  templateUrl: './requests.component.html',
  styleUrls: ['./requests.component.scss']
})
export class RequestsComponent implements OnInit {
  private readonly API = `${environment.apiUrl}`;

  selectedTab: 'incoming' | 'outgoing' = 'incoming';
  searchTerm = '';
  // PDF preview overlay state
pdfOpen = false;
pdfSafeUrl: SafeResourceUrl | null = null;
pdfTitle = '';
private currentDrawingNo = '';
private currentRevision = 0;


  // data from backend
  incomingRequests: IncomingRow[] = [];
  outgoingRequests: OutgoingRow[] = [];

  // filtered copies (used by search/sort)
  filteredIncoming: IncomingRow[] = [];
  filteredOutgoing: OutgoingRow[] = [];

  // sort state (kept from your code)
  sortColumn: string | null = null;
  sortDirection: SortDir = '';

  constructor(private http: HttpClient, private auth: AuthService, private sanitizer: DomSanitizer, private router: Router) {
    // Listen for navigation events to refresh data when user returns to this page
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        // Only refresh if we're navigating to the requests page
        if (event.url === '/requests' || event.url.startsWith('/requests?')) {
          this.loadRequestsData();
        }
      });
  }

  ngOnInit(): void {
    this.loadRequestsData();
  }

  // Load or refresh request lists from backend
  private loadRequestsData(): void {
    const me = this.auth.getLoggedInUser(); // should be Emp_ID string
    if (!me) {
      Swal.fire('Session expired', 'Please log in again.', 'warning');
      return;
    }

    // load both lists
    this.http.get<any[]>(`${this.API}/requests/reviewer/${me}`).subscribe({
      next: rows => {
        // map backend -> UI fields
        this.incomingRequests = (rows || []).map(r => ({
          creatorName: r.creatorName || '',
          id: r.creatorId || '',
          drawingNo: r.drawingNo || '',
          revisionNo: Number(r.revisionNo) || 0,
          creatorEmail: r.creatorEmail || '',
          createdDate: r.createdDate || '',
          lastReviewedDate: r.lastReviewedDate || null,
          status: (r.status === 'Reviewed' ? 'Reviewed' : 'Review')
        }));
        this.filteredIncoming = [...this.incomingRequests];
      },
      error: () => Swal.fire('Error', 'Failed to load incoming requests', 'error')
    });

    this.http.get<any[]>(`${this.API}/requests/creator/${me}`).subscribe({
      next: rows => {
        this.outgoingRequests = (rows || []).map(r => ({
          reviewerName: r.reviewerName || '',
          id: r.reviewerId || '',
          drawingNo: r.drawingNo || '',
          revisionNo: Number(r.revisionNo) || 0,
          reviewerEmail: r.reviewerEmail || '',
          createdDate: r.createdDate || '',
          status: (['Approved', 'Rejected'].includes(r.status) ? r.status : 'Pending')
        }));
        this.filteredOutgoing = [...this.outgoingRequests];
      },
      error: () => Swal.fire('Error', 'Failed to load outgoing requests', 'error')
    });
  }

  // Reload data when user navigates back to this page
  refreshRequests(): void {
    this.loadRequestsData();
  }

  // ---------- Search (kept your logic) ----------
  onSearch() {
    const term = (this.searchTerm || '').toLowerCase();

    if (this.selectedTab === 'incoming') {
      this.filteredIncoming = this.incomingRequests.filter(req =>
        Object.values(req).some(val => String(val ?? '').toLowerCase().includes(term))
      );
    } else {
      this.filteredOutgoing = this.outgoingRequests.filter(req =>
        Object.values(req).some(val => String(val ?? '').toLowerCase().includes(term))
      );
    }

    // keep current sort after filtering
    if (this.sortColumn) this.sortData(this.sortColumn);
  }

  // ---------- Sort (kept your API & feel) ----------
  sortData(column: string) {
    if (this.sortColumn === column) {
      this.sortDirection =
        this.sortDirection === 'asc' ? 'desc' :
        this.sortDirection === 'desc' ? '' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    const sortFn = (a: any, b: any) => {
      const av = (a[column] ?? '').toString().toLowerCase();
      const bv = (b[column] ?? '').toString().toLowerCase();
      if (av < bv) return this.sortDirection === 'asc' ? -1 : 1;
      if (av > bv) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    };

    if (this.selectedTab === 'incoming') {
      this.filteredIncoming = this.sortDirection
        ? [...this.filteredIncoming].sort(sortFn)
        : [...this.incomingRequests];
    } else {
      this.filteredOutgoing = this.sortDirection
        ? [...this.filteredOutgoing].sort(sortFn)
        : [...this.outgoingRequests];
    }
  }

  // ---------- Actions (placeholders you can wire to routes/modals) ----------
  reviewRequest(index: number) {
  const row = this.filteredIncoming[index]; // reviewer view row
  // row.drawingNo should be like "DR_7058609753"
  // row.revisionNo is a number
  this.router.navigate(['/uploads'], {
    queryParams: {
      drawing_id: row.drawingNo,
      revision: row.revisionNo
    }
  });
}

onEditClick(index: number) {
  const row = this.filteredIncoming[index];
  if (!row || row.status === 'Reviewed') return; // guard

  console.log('Navigating to canvas - Drawing:', row.drawingNo, 'Revision:', row.revisionNo);

  // Navigate to canvas for editing
  this.router.navigate(['/canvas'], {
    queryParams: {
      drawing_id: row.drawingNo,
      revision: row.revisionNo,
      creatorId: row.id
    },
    state: {
      drawingId: row.drawingNo,
      revision: row.revisionNo,
      creatorId: row.id
    }
  });
}


  viewDrawing(index: number) {
  const row =
    this.selectedTab === 'incoming'
      ? this.filteredIncoming[index]
      : this.filteredOutgoing[index];

  // Build view URL
  const url = `${this.API}/drawings/${encodeURIComponent(row.drawingNo)}/${row.revisionNo}/pdf/view`;

  // Save current for "Download" button
  this.currentDrawingNo = row.drawingNo;
  this.currentRevision = row.revisionNo;

  // Populate overlay
  this.pdfTitle = `${row.drawingNo} (Rev ${row.revisionNo})`;
  this.pdfSafeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
  this.pdfOpen = true;
}


  downloadDrawing(index: number) {
  const row =
    this.selectedTab === 'incoming'
      ? this.filteredIncoming[index]
      : this.filteredOutgoing[index];

  const url = `${this.API}/drawings/${encodeURIComponent(row.drawingNo)}/${row.revisionNo}/pdf/download`;
  window.open(url, '_blank'); // triggers download
}

downloadCurrent() {
  if (!this.currentDrawingNo || !this.currentRevision) return;
  const url = `${this.API}/drawings/${encodeURIComponent(this.currentDrawingNo)}/${this.currentRevision}/pdf/download`;
  window.open(url, '_blank');
}

closePdf() {
  this.pdfOpen = false;
  this.pdfSafeUrl = null;
  this.pdfTitle = '';
  this.currentDrawingNo = '';
  this.currentRevision = 0;
}

editRequest(index: number) {
  // Only present on the Reviewer (incoming) table
  const row = this.filteredIncoming[index];

  // Build a view URL so Canvas can display immediately (and still re-fetch if it wants)
  const pdfViewUrl = `${this.API}/drawings/${encodeURIComponent(
    row.drawingNo
  )}/${row.revisionNo}/pdf/view`;

  // Route to Canvas:
  // - Put drawing_id & revision in query params (survive refresh / deep-link)
  // - Put human-friendly meta in router state (instant render; optional on refresh)
  this.router.navigate(['/canvas'], {
    queryParams: {
      drawing_id: row.drawingNo,
      revision: row.revisionNo,
      creatorId: row.id
    },
    state: {
      from: 'requests',
      pdfViewUrl,
      meta: {
        drawingNo: row.drawingNo,
        revisionNo: row.revisionNo,
        creatorId: row.id,
        creatorName: row.creatorName,
        creatorEmail: row.creatorEmail,
        createdDate: row.createdDate,
        lastReviewedDate: row.lastReviewedDate ?? null
      }
    }
  });
}

deleteRequest(index: number, tab: 'incoming' | 'outgoing') {
  const row = tab === 'incoming' ? this.filteredIncoming[index] : this.filteredOutgoing[index];
  
  Swal.fire({
    title: 'Delete Request?',
    html: `Are you sure you want to delete this request?<br><br>
           <strong>Drawing:</strong> ${row.drawingNo}<br>
           <strong>Revision:</strong> ${row.revisionNo}`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'Yes, delete it!',
    cancelButtonText: 'Cancel'
  }).then((result: any) => {
    if (result.isConfirmed) {
      // Call backend to delete the request
      const url = `${this.API}/requests/delete/${encodeURIComponent(row.drawingNo)}/${row.revisionNo}`;
      
      this.http.delete(url).subscribe({
        next: () => {
          Swal.fire(
            'Deleted!',
            'The request has been deleted.',
            'success'
          );
          // Refresh the data to reflect the deletion
          this.loadRequestsData();
        },
        error: (err) => {
          console.error('Delete error:', err);
          Swal.fire(
            'Error',
            'Failed to delete the request. ' + (err?.error?.message || ''),
            'error'
          );
        }
      });
    }
  });
}

}
