import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; // Add this import
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-report-table',
  templateUrl: './report-table.component.html',
  styleUrls: ['./report-table.component.scss'],
})
export class ReportTableComponent implements OnChanges {
  @Input() reportType!: 'employeeReport' | 'drawingReport';
  @Input() employeeId?: string;
  @Input() drawingId?: string;
  @Input() startDate?: string;
  @Input() endDate?: string;

  employeeSummary: {
    id?: string;
    name?: string;
    pc?: string;
    division?: string;
    totalAccepted?: number;
    totalRejected?: number;
    passRatio?: string;
  } = {};

  tableData: any[] = [];
  tableHeaders: string[] = [];

  private apiUrls = {
    employeeReport: `${environment.apiUrl}/api/employee-report`,
    drawingReport: `${environment.apiUrl}/api/drawing-report`,
  };

  constructor(private http: HttpClient) { }

  ngOnChanges(changes: SimpleChanges) {
    if (
      changes['employeeId'] ||
      changes['drawingId'] ||
      changes['reportType'] ||
      changes['startDate'] ||
      changes['endDate']
    ) {
      this.fetchTableData();
    }
  }

  fetchTableData() {
    if (!this.reportType) return;

    const apiUrl = this.apiUrls[this.reportType];
    let params = new HttpParams().set('reportType', this.reportType);

    if (this.employeeId) params = params.set('employeeId', this.employeeId);
    if (this.drawingId) params = params.set('drawingId', this.drawingId);
    if (this.startDate) {
      let formattedStart = new Date(this.startDate)
        .toISOString()
        .split('T')[0];
      params = params.set('start_date', formattedStart);
    }
    if (this.endDate) {
      let formattedEnd = new Date(this.endDate).toISOString().split('T')[0];
      params = params.set('end_date', formattedEnd);
    }

    console.log('🚀 API Request:', apiUrl, 'Params:', params.toString());

    this.http.get<any[]>(apiUrl, { params }).subscribe(
      (data) => {
        console.log('✅ API Response:', data);

        this.tableData = data.map((row) => ({
          ...row,
          errorCodes: this.parseErrorCodes(row.errorCodes),
        }));

        this.sortTableData();
        this.setTableHeaders();

        // 🆕 Build employee summary if employeeReport
        if (this.reportType === 'employeeReport' && this.employeeId) {
          const accepted = this.tableData.filter(
            (r) => r.Decision?.toLowerCase() === 'approve'
          ).length;
          const rejected = this.tableData.filter(
            (r) => r.Decision?.toLowerCase() === 'reject'
          ).length;
          const total = accepted + rejected;
          const ratio =
            total > 0 ? ((accepted / total) * 100).toFixed(1) + '%' : '0%';

          this.employeeSummary = {
            id: this.employeeId,
            name: data[0]?.Employee_name || '', // depends on your API field
            pc: data[0]?.PC || '', // adjust based on backend
            division: data[0]?.Division || '', // adjust based on backend
            totalAccepted: accepted,
            totalRejected: rejected,
            passRatio: ratio,
          };
        }
      },
      (error) => {
        console.error('❌ API Fetch Error:', error);
        this.tableData = [];
      }
    );
  }

  parseErrorCodes(errorCodes: any): string[] {
    if (!errorCodes) return [];
    if (typeof errorCodes === 'string') {
      try {
        return JSON.parse(errorCodes.replace(/'/g, '"'));
      } catch {
        return errorCodes.split(',').map((e) => e.trim());
      }
    }
    return Array.isArray(errorCodes) ? errorCodes : [];
  }

  setTableHeaders() {
    if (this.reportType === 'employeeReport') {
      this.tableHeaders = [
        'Drawing ID',
        'Revision Number',
        'Error Codes',
        'Task Number',
        'Reviewer Emp ID',
        'Decision',
      ];
    } else if (this.reportType === 'drawingReport') {
      this.tableHeaders = [
        'Revision Number',
        'Creator Emp ID',
        'Reviewer Emp ID',
        'Error Codes',
        'Drawing Type',
        'Decision',
      ];
    }
  }

  // Function to get the correct property key for each column name
  getColumnKey(header: string): string {
    const headerMapping: { [key: string]: string } = {
      'Drawing ID': 'Drawing_ID',
      'Revision Number': 'Revision_num',
      'Error Codes': 'Error_codes',
      'Reviewer Emp ID': 'Reviewer_EMP_ID',
      'Review Date': 'Review_Date',
      'Creator Emp ID': 'Creator_EMP_ID',
      'Drawing Type': 'Drawing_type',
      'Task Number': 'Task_Number',
      Decision: 'Decision',
    };
    return headerMapping[header] || header; // Return mapped key or original if not found
  }

  sortTableData() {
    if (this.reportType === 'employeeReport') {
      // Group by Drawing_ID and sort by Revision_num
      this.tableData.sort((a, b) => {
        if (a.Drawing_ID === b.Drawing_ID) {
          return a.Revision_num - b.Revision_num; // Sort by Revision number
        }
        return a.Drawing_ID.localeCompare(b.Drawing_ID); // Group by Drawing_ID
      });
    } else if (this.reportType === 'drawingReport') {
      // Sort by Revision_num for drawing data
      this.tableData.sort((a, b) => a.Revision_num - b.Revision_num);
    }
  }

  columnMapping: { [key: string]: string } = {
    'Drawing ID': 'Drawing_ID',
    'Revision Number': 'Revision_num',
    'Error Codes': 'Error_codes',
    'Reviewer Emp ID': 'Reviewer_EMP_ID',
    'Review Date': 'Review_Date',
    'Creator Emp ID': 'Creator_EMP_ID',
    'Drawing Type': 'Drawing_type',
    'Task Number': 'Task_Number', 
    Decision: 'Decision',
  };

  exportToExcel(): void {
    const data = this.tableData.map((row) =>
      this.tableHeaders.map((header) =>
        header === 'Error Codes'
          ? Array.isArray(row[this.columnMapping[header]])
            ? row[this.columnMapping[header]].join(', ')
            : row[this.columnMapping[header]] ?? ''
          : row[this.columnMapping[header]] ?? ''
      )
    );

    const worksheet: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet([
      this.tableHeaders,
      ...data,
    ]);
    const workbook: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
    XLSX.writeFile(workbook, 'report.xlsx');
  }

  exportToPDF(): void {
    const doc = new jsPDF();
    const headers = [this.tableHeaders];
    const data = this.tableData.map((row) =>
      this.tableHeaders.map((header) => row[this.columnMapping[header]] ?? '')
    );

    autoTable(doc, {
      head: headers,
      body: data,
      didParseCell: function (data) {
        const colIndex = headers[0].indexOf('Decision');
        if (data.column.index === colIndex) {
          const cellText = data.cell.text[0]?.toLowerCase();
          if (cellText === 'approve') {
            data.cell.styles.textColor = [0, 128, 0]; // Green
          } else if (cellText === 'reject') {
            data.cell.styles.textColor = [255, 0, 0]; // Red
          }
        }
      },
    });

    doc.save('report.pdf');
  }

  downloadDrawing(index: number): void {
    const row = this.tableData[index];
    const drawingId = row?.Drawing_ID;
    const revision = row?.Revision_num;

    if (!drawingId || revision == null) {
      console.warn('Missing Drawing_ID or Revision_num for this row.');
      return;
    }

    const fileUrl = `${environment.apiUrl}/api/drawings/${encodeURIComponent(
      drawingId
    )}/${encodeURIComponent(revision)}/download`;

    this.http.get(fileUrl, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${drawingId}-${String(revision).padStart(2, '0')}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        console.error('❌ Failed to download drawing:', err);
      },
    });
  }
}
