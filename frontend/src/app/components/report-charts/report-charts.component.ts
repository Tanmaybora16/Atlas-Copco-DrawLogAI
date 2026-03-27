import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexXAxis,
  ApexPlotOptions,
  ApexTooltip,
} from 'ng-apexcharts';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

// Error code descriptions from uploads component
const errorDescriptions: { [key: string]: string } = {
  P1: '1254 K Criteria for surface roughness',
  P2: '1350 K-f,m,c or v as required General tolerances and standard references',
  P3: '1356 K Indirectly stated tolerances for fusion welding',
  P4: '4366 K  Threaded blind holes',
  P4a: '4366:01 K  Threaded blind holes_ASME',
  P5: '6131 K Dimensional tolerances and machining allowances for castings',
  P6: '6134 K Specifications for steel and iron casting requirements',
  P7: '6136 K Specifications of aluminium casting requirements',
  P8: '6785 AIR Paint specifications',
  P9: '6891 K Indication of welding data on drawings',
  P11: 'Confidentiality note. It should contain "This document is property of Atlas Copco AB and shall not without our permission be altered, copied, used for manufacturing or communicated to any other person or company".',
  P12: 'Prohibited substances note',
  P13: 'Sharp edges note',
  P14: 'Check drawing & document edition, vault edition and BPCS edition are same',
  P15: 'Part or assy linked to document',
  P16: 'All parts latest revision',
  P17: 'Material  assigned. Should be given in title block of the drawing. Exception for tabular drawing',
  P18: 'Material  comment added (T for thickness) if not dimensioned',
  P19: 'Treatment assigned, or not applicable. Should be given in title block of the drawing. Exception for tabular drawing',
  P20: 'Treatment see drawing',
  P21: 'Surface treatment - see drawing',
  P22: 'Latest edition of Atlas Copco template used. Exception US: Latest edition of ANSI templates used',
  P23: 'Check for spelling mistake',
  P24: 'Page numbering if applicable  ',
  P26: 'Standard scale used. Exception US: Scales to be used 1/1; 1/2; 1/4; 2/1; 3/1; 4/1; 5/1; 10/1',
  P27: 'Are section/detail views nominated',
  P28: 'All basic dimensions available',
  P29: 'Tolerances deviating from general tolerance',
  P30: 'Geometrical tolerances stated correctly',
  P31: 'Revision note and symbol(s) available and equal',
  P32: 'Welding symbols all available',
  P33: 'Surface roughness symbols and indicators',
  P34: 'All centermarks and centerlines drawn for holes / symmetric parts',
  P35: 'Ten digit numbers',
  P36: 'Confidentiality class: Confidential',
  P37: 'Confidentiality class: Internal',
  P38: 'Text on drawing acc.Atlas Copco standard 1212 K . - English & Portugese text should have font "Arial" - Chinese text should have font "Simsun"',
  P39: 'Is the drawing unambigously',
  P40: 'Approval notification if needeed (PED, ASME,….)',
  P41: 'Symbol(s) of quantity Atlas Copco standard 1420 K',
  P42: 'All R/S or - markings correct',
  P43: 'No material on standard parts',
  P44: 'Material and comment complete if applicable',
  P46: 'Check that no dimensions are manually changed',
  P47: 'Check that at least english language is used',
  P48: 'Check that Part numbers and Qty are not manually overwritten',
  P49: 'Check that the drawing does not relates to a standard part',
  P50: 'Check weight on drawing',
  P51: "In case of tabular drawing, all mentioned 3D's should be linked to the tabular drawing",
  P57: 'Check edition is available for all item numbers of a tabular drawing',
  P58: 'Check supplier information is not given on bought out parts except for situations referenced in AC Standard 1015K',
  P59: 'Check brand logo in template - supplier parts/Manufacturing parts - AC logo. For dimension drawing, installation drawing, ASL, AIB -de-brand or owned brand',
  P70: 'Check \'All files are "For Approval" or "Approved" during ECO',
};

export type ChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  dataLabels: ApexDataLabels;
  plotOptions: ApexPlotOptions;
  xaxis: ApexXAxis;
  title: any;
  colors?: string[];
  tooltip?: ApexTooltip;
};

@Component({
  selector: 'app-report-charts',
  templateUrl: './report-charts.component.html',
  styleUrls: ['./report-charts.component.scss']
})
export class ReportChartsComponent implements OnChanges {
  @Input() reportType: 'employeeReport' | 'drawingReport' | 'taskReport' = 'employeeReport';
  @Input() employeeId: string = '';
  @Input() drawingId: string = '';
  @Input() taskNumber: string = '';
  @Input() startDate: string = ''; // expect YYYY-MM-DD
  @Input() endDate: string = '';   // expect YYYY-MM-DD
  @Input() selectedTeams: string[] = []; // for task report filtering

  public chartOptionsErrors!: Partial<ChartOptions>;
  public chartOptionsDrawings!: Partial<ChartOptions>;
  public chartOptionsTasks!: any; // Use any for pie chart options
  loading = false;
  error: string | null = null;

  private readonly API_BASE = `${environment.apiUrl}`;

  constructor(private http: HttpClient) {}

  ngOnChanges(changes: SimpleChanges): void {
    // Clear charts if switching to an empty ID
    if (this.reportType === 'employeeReport' && !this.employeeId) {
      this.resetCharts();
      return;
    }
    if (this.reportType === 'drawingReport' && !this.drawingId) {
      this.resetCharts();
      return;
    }

    if (this.reportType) {
      this.fetchChartData();
    }
  }

  private resetCharts(): void {
    this.chartOptionsErrors = { series: [], chart: { type: 'bar', height: 0 } };
    this.chartOptionsDrawings = { series: [], chart: { type: 'bar', height: 0 } };
    this.chartOptionsTasks = { series: [], labels: [], chart: { type: 'pie', height: 0 } };
  }

  fetchChartData(): void {
    this.loading = true;
    this.error = null;

    const trendApiUrl = `${this.API_BASE}/api/error-summary`;
    const drawingApiUrl = `${this.API_BASE}/api/employee-drawing-status`;

    // Build params
    let params = new HttpParams();
    if (this.reportType === 'employeeReport' && this.employeeId) {
      params = params.set('employeeId', this.employeeId);
    } else if (this.reportType === 'drawingReport' && this.drawingId) {
      params = params.set('drawingId', this.drawingId);
    } else if (this.reportType === 'taskReport') {
      if (this.taskNumber) params = params.set('task_number', this.taskNumber);
      if (this.selectedTeams && this.selectedTeams.length > 0) {
        this.selectedTeams.forEach(t => params = params.append('team', t));
      }
    }

    if (this.startDate) params = params.set('start_date', this.normalizeDate(this.startDate));
    if (this.endDate)   params = params.set('end_date',   this.normalizeDate(this.endDate));

    if (this.reportType === 'employeeReport') {
      // Need both: top errors + monthly approved/rejected
      forkJoin({
        trend: this.http.get<any[]>(trendApiUrl, { params }).pipe(catchError(() => of([]))),
        monthly: this.http.get<any>(drawingApiUrl, { params }).pipe(catchError(() => of({})))
      }).subscribe({
        next: ({ trend, monthly }) => {
          this.updateEmployeeCharts(trend || [], monthly || {});
          this.loading = false;
        },
        error: (err) => {
          console.error('❌ Charts (employee) error:', err);
          this.error = 'Failed to fetch data';
          this.resetCharts();
          this.loading = false;
        }
      });
    } else if (this.reportType === 'drawingReport') {
      // Only need: top errors for drawing
      this.http.get<any[]>(trendApiUrl, { params })
        .pipe(catchError(() => of([])))
        .subscribe({
          next: (trend) => {
            this.updateDrawingCharts(trend || []);
            this.loading = false;
          },
          error: (err) => {
            console.error('❌ Charts (drawing) error:', err);
            this.error = 'Failed to fetch data';
            this.resetCharts();
            this.loading = false;
          }
        });
    } else if (this.reportType === 'taskReport') {
      const taskApiUrl = `${this.API_BASE}/api/task-summary`;
      this.http.get<any[]>(taskApiUrl, { params })
        .pipe(catchError(() => of([])))
        .subscribe({
          next: (data) => {
            this.updateTaskCharts(data || []);
            this.loading = false;
          },
          error: (err) => {
            console.error('❌ Charts (task) error:', err);
            this.error = 'Failed to fetch task data';
            this.resetCharts();
            this.loading = false;
          }
        });
    }
  }

  private normalizeDate(d: string): string {
    // Accept YYYY-MM-DD or any parseable date string, return YYYY-MM-DD
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return d;
      return dt.toISOString().slice(0, 10);
    } catch {
      return d;
    }
  }

  private createErrorChart(errors: [string, number][], title: string): Partial<ChartOptions> {
    return {
      series: [{ name: 'Error Count', data: errors.map(([, count]) => count) }],
      chart: { type: 'bar', height: 350 },
      title: { text: title, align: 'center' },
      plotOptions: { bar: { dataLabels: { position: 'top' }, horizontal: false } },
      dataLabels: { enabled: true },
      xaxis: { categories: errors.map(([code]) => code) },
      colors: ['#1CC487', '#F45463'],
      tooltip: {
        custom: function({ series, seriesIndex, dataPointIndex, w }) {
          const errorCode = w.globals.labels[dataPointIndex];
          const errorCount = series[seriesIndex][dataPointIndex];
          const description = errorDescriptions[errorCode] || 'No description available';
          
          return `
              <div style="
                padding: 10px 14px;
                background: white;
                color: black;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                max-width: 350px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                background: #eceff1;
                font-weight: 500;
              ">
                <div style="
                  margin-bottom: 6px;
                ">
                  ${errorCode}
                </div>
                <div style="
                  font-size: 12px;
                  opacity: 0.95;
                  line-height: 1.4;
                  margin-bottom: 8px;
                  line-height: 1.5;
                  word-wrap: break-word;
                  overflow-wrap: break-word;
                  white-space: normal;
                ">
                  ${description}
                </div>
                <div style="
                  font-size: 12px;
                  opacity: 0.9;
                  display: flex;
                  justify-content: space-between;
                  padding-top: 6px;
                  border-top: 1px solid rgba(255, 255, 255, 0.42);
                ">
                  <span>${errorCount} occurrence${errorCount !== 1 ? 's' : ''}</span>
                </div>
              </div>
            `;
        }
      }
    };
  }

  private updateEmployeeCharts(trendData: any[], monthlyData: any): void {
    if (!Array.isArray(trendData) || trendData.length === 0) {
      this.chartOptionsErrors = this.createErrorChart([], 'No Data Available');
    } else {
      const errors: [string, number][] = trendData
        .filter(i => i && i.error_code)
        .map(i => [String(i.error_code).trim(), Number(i.count) || 0] as [string, number])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      this.chartOptionsErrors = this.createErrorChart(errors, `Top 10 Errors for ${this.employeeId}`);
    }

    const keys = Object.keys(monthlyData || {})
      .filter(k => /^ec_\d{2}_\d{4}$/i.test(k))
      .sort((a, b) => {
        const parse = (k: string) => {
          const [, mm, yyyy] = k.match(/^ec_(\d{2})_(\d{4})$/i) || [];
          return mm && yyyy ? new Date(Number(yyyy), Number(mm) - 1, 1).getTime() : 0;
        };
        return parse(a) - parse(b);
      });

    const months: string[] = [];
    const approvedData: number[] = [];
    const rejectedData: number[] = [];

    keys.forEach(k => {
      const [, mm, yyyy] = k.match(/^ec_(\d{2})_(\d{4})$/i) || [];
      months.push(`${mm}-${yyyy}`);
      const bucket = monthlyData[k] || {};
      approvedData.push(Number(bucket.approve) || 0);
      rejectedData.push(Number(bucket.reject) || 0);
    });

    this.chartOptionsDrawings = {
      series: [
        { name: 'Approved', data: approvedData },
        { name: 'Rejected', data: rejectedData },
      ],
      chart: { type: 'bar', height: 350 },
      title: { text: 'Approved vs Rejected Drawings per Month', align: 'center' },
      xaxis: { categories: months },
      dataLabels: { enabled: true },
      plotOptions: { bar: { horizontal: false } },
      colors: ['#1CC487', '#F45463'],
    };
  }

  private updateDrawingCharts(trendData: any[]): void {
    if (!Array.isArray(trendData) || trendData.length === 0) {
      this.chartOptionsErrors = this.createErrorChart([], 'No error data available');
      this.chartOptionsDrawings = { series: [], chart: { type: 'bar', height: 0 } };
      return;
    }

    const errors: [string, number][] = trendData
      .filter(i => i && i.error_code && String(i.error_code).toLowerCase() !== 'no errors detected')
      .map(i => [String(i.error_code).trim(), Number(i.count) || 0] as [string, number])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    this.chartOptionsErrors = this.createErrorChart(errors, `Top 5 Errors for Drawing ${this.drawingId}`);
    this.chartOptionsDrawings = { series: [], chart: { type: 'bar', height: 0 } };
  }

  private updateTaskCharts(data: any[]): void {
    if (!Array.isArray(data) || data.length === 0) {
      this.chartOptionsTasks = { series: [], labels: [], chart: { type: 'pie', height: 0 } };
      return;
    }

    const labels = data.map(item => item.team || 'Unknown');
    const series = data.map(item => Number(item.count) || 0);
    const totalTasks = series.reduce((a, b) => a + b, 0);

    this.chartOptionsTasks = {
      series: series,
      chart: {
        type: 'pie',
        height: 380
      },
      labels: labels,
      title: {
        text: `Task Distribution by Team (Total: ${totalTasks})`,
        align: 'center'
      },
      responsive: [
        {
          breakpoint: 480,
          options: {
            chart: { width: 200 },
            legend: { position: 'bottom' }
          }
        }
      ],
      dataLabels: {
        enabled: true,
        formatter: (val: any, opts: any) => {
          return opts.w.globals.series[opts.seriesIndex];
        }
      },
      legend: { position: 'right' }
    };
  }
}