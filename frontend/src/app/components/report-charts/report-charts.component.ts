import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexXAxis,
  ApexPlotOptions,
} from 'ng-apexcharts';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export type ChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  dataLabels: ApexDataLabels;
  plotOptions: ApexPlotOptions;
  xaxis: ApexXAxis;
  title: any;
  colors?: string[]; // ← add this

};

@Component({
  selector: 'app-report-charts',
  templateUrl: './report-charts.component.html',
  styleUrls: ['./report-charts.component.scss']
})
export class ReportChartsComponent implements OnChanges {
  @Input() reportType: 'employeeReport' | 'drawingReport' = 'employeeReport';
  @Input() employeeId: string = '';
  @Input() drawingId: string = '';
  @Input() startDate: string = ''; // expect YYYY-MM-DD
  @Input() endDate: string = '';   // expect YYYY-MM-DD

  public chartOptionsErrors!: Partial<ChartOptions>;
  public chartOptionsDrawings!: Partial<ChartOptions>;
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

    if (this.reportType && (this.employeeId || this.drawingId)) {
      this.fetchChartData();
    }
  }

  private resetCharts(): void {
    this.chartOptionsErrors = { series: [], chart: { type: 'bar', height: 0 } };
    this.chartOptionsDrawings = { series: [], chart: { type: 'bar', height: 0 } };
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
    } else {
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
    };
  }

  private updateEmployeeCharts(trendData: any[], monthlyData: any): void {
    // Top error codes (server already limits; we sort again defensively)
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

    // Monthly Approved vs Rejected
    const keys = Object.keys(monthlyData || {})
      .filter(k => /^ec_\d{2}_\d{4}$/i.test(k)) // matches EC_MM_YYYY (case-insensitive)
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
}