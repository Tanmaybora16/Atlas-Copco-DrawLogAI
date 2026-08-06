import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
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
  @Input() reportType!: 'employeeReport' | 'drawingReport' | 'taskReport';
  @Input() employeeId?: string;
  @Input() drawingId?: string;
  @Input() taskNumber?: string;
  @Input() startDate?: string;
  @Input() endDate?: string;
  @Input() selectedTeam: string[] = [];
  @Input() allEmployees: string[] = [];
  @Output() summaryUpdated = new EventEmitter<any>();

  employeeSummary: {
    id?: string;
    name?: string;
    pc?: string;
    division?: string;
    totalAccepted?: number;
    totalRejected?: number;
    passRatio?: string;
    totalSubmissions?: number;
    activeCount?: number;
    inactiveCount?: number;
    activeNames?: string[];
    inactiveNames?: string[];
  } = {};

  tableData: any[] = [];
  tableHeaders: string[] = [];

  private apiUrls: { [key: string]: string } = {
    employeeReport: `${environment.apiUrl}/api/employee-report`,
    drawingReport: `${environment.apiUrl}/api/drawing-report`,
    taskReport: `${environment.apiUrl}/api/task-report`,
  };

  constructor(private http: HttpClient) { }

  ngOnChanges(changes: SimpleChanges) {
    if (
      changes['employeeId'] ||
      changes['drawingId'] ||
      changes['taskNumber'] ||
      changes['reportType'] ||
      changes['startDate'] ||
      changes['endDate'] ||
      changes['selectedTeam']
    ) {
      this.fetchTableData();
    }
  }

  fetchTableData() {
    if (!this.reportType) return;

    if (this.reportType === 'employeeReport' && !this.employeeId && (!this.selectedTeam || this.selectedTeam.length === 0)) {
      this.tableData = [];
      this.employeeSummary = {};
      return;
    }
    if (this.reportType === 'drawingReport' && !this.drawingId && (!this.selectedTeam || this.selectedTeam.length === 0)) {
      this.tableData = [];
      return;
    }

    const apiUrl = this.apiUrls[this.reportType];
    let params = new HttpParams().set('reportType', this.reportType);

    if (this.employeeId) params = params.set('employeeId', this.employeeId);
    if (this.drawingId) params = params.set('drawingId', this.drawingId);
    if (this.reportType === 'taskReport' && this.taskNumber) {
      params = params.set('task_number', this.taskNumber);
    }
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
    if (this.selectedTeam && this.selectedTeam.length > 0) {
      this.selectedTeam.forEach(t => params = params.append('team', t));
    }

    console.log('🚀 API Request:', apiUrl, 'Params:', params.toString());

    this.http.get<any[]>(apiUrl, { params }).subscribe(
      (data) => {
        console.log('✅ API Response:', data);

        this.tableData = data.map((row) => ({
          ...row,
          Error_codes: this.parseErrorCodes(row.Error_codes || row.errorCodes),
        }));

        this.sortTableData();
        this.setTableHeaders();

        // Build employee/team summary if employeeReport
        if (this.reportType === 'employeeReport' && (this.employeeId || (this.selectedTeam && this.selectedTeam.length > 0))) {
          const accepted = this.tableData.filter(
            (r) => r.Decision?.toLowerCase() === 'approve'
          ).length;
          const rejected = this.tableData.filter(
            (r) => r.Decision?.toLowerCase() === 'reject'
          ).length;
          const total = accepted + rejected;
          const ratio =
            total > 0 ? ((accepted / total) * 100).toFixed(1) + '%' : '0%';

          const activeIds = new Set(this.tableData.map(r => r.Reviewer_EMP_ID).filter(id => id));
          const activeNames: string[] = [];
          const inactiveNames: string[] = [];

          if (this.allEmployees && this.allEmployees.length > 0) {
            this.allEmployees.forEach(empStr => {
              const parts = empStr.split(' - ');
              const empId = parts[0].trim();
              const empName = parts.length > 1 ? parts[1].trim() : empId;

              if (activeIds.has(empId)) {
                activeNames.push(empName);
              } else {
                inactiveNames.push(empName);
              }
            });
          }

          this.employeeSummary = {
            id: this.employeeId || this.selectedTeam.join(', '),
            name: this.employeeId ? (data[0]?.Employee_name || '') : 'Team Summary',
            pc: this.employeeId ? (data[0]?.PC || '') : 'Multiple PCs',
            division: this.employeeId ? (data[0]?.Division || '') : (data[0]?.Division || ''),
            totalAccepted: accepted,
            totalRejected: rejected,
            passRatio: ratio,
            totalSubmissions: this.tableData.length,
            activeCount: activeNames.length,
            inactiveCount: inactiveNames.length,
            activeNames: activeNames,
            inactiveNames: inactiveNames
          };

          this.summaryUpdated.emit(this.employeeSummary);
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
      if (!this.employeeId && this.selectedTeam && this.selectedTeam.length > 0) {
        this.tableHeaders = [
          'Creator Emp ID',
          'Drawing ID',
          'Revision Number',
          'Error Codes',
          'Task Number',
          'Reviewer Emp ID',
          'Decision',
        ];
      } else {
        this.tableHeaders = [
          'Drawing ID',
          'Revision Number',
          'Error Codes',
          'Task Number',
          'Reviewer Emp ID',
          'Decision',
        ];
      }
    } else if (this.reportType === 'drawingReport') {
      if (!this.drawingId && this.selectedTeam && this.selectedTeam.length > 0) {
        this.tableHeaders = [
          'Drawing ID',
          'Revision Number',
          'Creator Emp ID',
          'Reviewer Emp ID',
          'Error Codes',
          'Drawing Type',
          'Decision',
        ];
      } else {
        this.tableHeaders = [
          'Revision Number',
          'Creator Emp ID',
          'Reviewer Emp ID',
          'Error Codes',
          'Drawing Type',
          'Decision',
        ];
      }
    } else if (this.reportType === 'taskReport') {
      this.tableHeaders = [
        'Team',
        'Task Number',
        'Drawing ID',
        'Revision Number',
        'Creator Emp ID',
        'Reviewer Emp ID',
        'Error Codes',
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
    } else if (this.reportType === 'taskReport') {
      // Sort by Task Number natively
      this.tableData.sort((a, b) => {
        if (a.Task_Number === b.Task_Number) {
          return a.Drawing_ID === b.Drawing_ID ?
            a.Revision_num - b.Revision_num : a.Drawing_ID.localeCompare(b.Drawing_ID);
        }
        return (a.Task_Number || '').localeCompare(b.Task_Number || '');
      });
    }
  }

  columnMapping: { [key: string]: string } = {
    'Team': 'Team',
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
