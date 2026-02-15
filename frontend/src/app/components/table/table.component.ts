import { Component, Input, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import * as FileSaver from 'file-saver';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-table',
  templateUrl: './table.component.html',
  styleUrls: ['./table.component.scss'],
})
export class TableComponent implements OnInit {
  @Input() selectedTeam: string = '';
  @Input() selectedPC: string = '';
  @Input() startDate: string = '';
  @Input() endDate: string = '';

  get showTeamPC(): boolean {
    return this.selectedTeam !== "" || this.selectedPC !== "";
  }

  passRatioData: any[] = [];

  constructor(private http: HttpClient) { }

  ngOnInit() {
    this.fetchPassRatioData();
  }

  ngOnChanges() {
    this.fetchPassRatioData();
  }

  fetchPassRatioData() {
    const filters = {
      team: this.selectedTeam,
      pc: this.selectedPC,
      start_date: this.startDate,
      end_date: this.endDate,
    };

    this.http.post(`${environment.apiUrl}/get-pass-ratio`, filters).subscribe((data: any) => {
      const currentYear = new Date().getFullYear();

      // Check if no filters are applied
      const noFiltersApplied = !this.selectedTeam && !this.selectedPC && !this.startDate && !this.endDate;

      // Filter to current year only if no filters are selected
      this.passRatioData = noFiltersApplied
        ? data.filter((row: any) => row.year == currentYear)
        : data;
    });
  }

  getPassRatioClass(passRatio: string): string {
    if (passRatio === 'NA') return 'pass-na'; // Light Green for NA
    const ratio = parseFloat(passRatio.replace('%', '')) || 0;
    if (ratio >= 71) return 'pass-high';   // Green (Good Performance)
    if (ratio >= 41 && ratio < 71) return 'pass-medium'; // Yellow (Average Performance)
    return 'pass-low';                     // Red (Poor Performance)
  }

  downloadExcel() {
    const data = this.passRatioData.map(row => {
      return {
        'Year': row.year,
        'Month': row.month,
        ...(this.showTeamPC ? { 'Team': this.selectedTeam, 'PC': this.selectedPC } : {}),
        'No of Drawings': row.total_drawings,
        'Pass Ratio': row.pass_ratio,
        'Count': row.accepted_drawings
      };
    });

    const worksheet: XLSX.WorkSheet = XLSX.utils.json_to_sheet(data, { header: Object.keys(data[0]) });
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, worksheet, 'Pass Ratio Report');
    XLSX.writeFile(wb, 'Pass_Ratio_Report.xlsx');
  }

  downloadPDF() {
    const doc = new jsPDF();
    doc.text('Pass Ratio Report', 14, 10);

    const tableColumn = ['Year', 'Month', 'No of Drawings', 'Pass Ratio', 'Count'];
    if (this.showTeamPC) {
      tableColumn.splice(2, 0, 'Team', 'PC');
    }

    autoTable(doc, {
      head: [tableColumn],
      body: this.passRatioData.map(row => {
        const rowData = [row.year, row.month, row.total_drawings, row.pass_ratio, row.accepted_drawings];
        if (this.showTeamPC) {
          rowData.splice(2, 0, this.selectedTeam, this.selectedPC);
        }
        return rowData;
      }),
      startY: 20,
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 2 },
      headStyles: { fillColor: [0, 102, 204] },
      didParseCell: function (data) {
        const columnOffset = data.table.columns.length === 7 ? 2 : 0; // Adjust color column index if filters are applied
        if (data.section === 'body' && (data.column.index === (3 + columnOffset))) {
          const passRatioValue = (data.cell.raw || "").toString().replace('%', '') === 'NA'
            ? 'NA'
            : parseFloat((data.cell.raw || "").toString().replace('%', '')) || 0;

          const color: [number, number, number] =
            passRatioValue === 'NA' ? [28, 196, 135] :
              passRatioValue >= 71 ? [28, 196, 135] :
                passRatioValue >= 41 && passRatioValue < 71 ? [244, 237, 91] :
                  [244, 84, 99];

          data.row.cells[3 + columnOffset].styles.fillColor = color;
          data.row.cells[4 + columnOffset].styles.fillColor = color;
        }
      },
    });

    doc.save('Pass_Ratio_Report.pdf');
  }
}
