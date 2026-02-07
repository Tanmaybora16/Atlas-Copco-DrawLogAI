import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexXAxis,
  ApexPlotOptions,
} from 'ng-apexcharts';
import { environment } from 'src/environments/environment';

export type ChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  dataLabels: ApexDataLabels;
  plotOptions: ApexPlotOptions;
  xaxis: ApexXAxis;
  title: any;
};

@Component({
  selector: 'app-bar-chart',
  templateUrl: './bar-chart.component.html',
  styleUrls: ['./bar-chart.component.scss'],
})
export class BarChartComponent implements OnChanges {
  @Input() reportType!: string;
  @Input() selectedDivision!: string;
  @Input() selectedPC!: string;
  @Input() startDate!: string;
  @Input() endDate!: string;
  
  public chartOptions!: Partial<ChartOptions>;

  constructor(private http: HttpClient) {}

  ngOnChanges(changes: SimpleChanges) {
    if (
      changes['reportType'] || 
      changes['selectedDivision'] || 
      changes['selectedPC'] || 
      changes['startDate'] || 
      changes['endDate']
    ) {
      this.fetchReportData();
    }
  }

  fetchReportData() {
    let apiUrl =
      this.reportType === 'monthly'
        ? `${environment.apiUrl}/api/monthly-error-report`
        : `${environment.apiUrl}/api/trend-error-report`;
    
    let params = new HttpParams();
    if (this.startDate) params = params.set('start_date', this.startDate);
    if (this.endDate) params = params.set('end_date', this.endDate);
    if (this.selectedDivision) params = params.set('division', this.selectedDivision);
    if (this.selectedPC) params = params.set('pc', this.selectedPC);

    this.http.get<any[]>(apiUrl, { params }).subscribe(
      (response) => {
        console.log(`✅ Fetched ${this.reportType} Data:`, response);
        this.updateChartData(response);
      },
      (error) => {
        console.error('🔴 Error fetching data:', error);
      }
    );
  }

  updateChartData(reports: any[]) {
    if (this.reportType === 'monthly') {
      // Sort chronologically by date
      reports.sort((a, b) => {
        const [m1, y1] = a.month.split('-');
        const [m2, y2] = b.month.split('-');
        return new Date(`${y1}-${m1}-01`).getTime() - new Date(`${y2}-${m2}-01`).getTime();
      });
  
      let data: number[] = [];
      let categories: string[] = [];
  
      reports.forEach((report) => {
        const [month, year] = report.month.split('-');
        const date = new Date(`${year}-${month}-01`);
        const formatted = date.toLocaleString('en-US', { month: 'short', year: 'numeric' }); // MMM YYYY
        categories.push(formatted);
        data.push(report.total_errors);
      });
  
      this.chartOptions = {
        series: [{ name: 'Total Errors', data }],
        chart: { type: 'bar', height: 350 },
        title: { text: 'Monthly Error Count', align: 'center' },
        plotOptions: { bar: { horizontal: false } },
        dataLabels: { enabled: true },
        xaxis: { categories },
      };
    } else {
      // Top 10 error codes
      let filteredReports = reports.filter(report => report.count > 1)
                                  .sort((a, b) => b.count - a.count)
                                  .slice(0, 10);
      let data: number[] = [];
      let categories: string[] = [];
  
      filteredReports.forEach((report) => {
        categories.push(report.error_code);
        data.push(report.count);
      });
  
      this.chartOptions = {
        series: [{ name: 'Error Code Count', data }],
        chart: { type: 'bar', height: 350 },
        title: { text: 'Top 10 Error Codes', align: 'center' },
        plotOptions: { bar: { horizontal: false, columnWidth: '60%' } },
        dataLabels: { enabled: true },
        xaxis: {
          categories,
          labels: { rotate: -45, hideOverlappingLabels: true, trim: true },
        },
      };
    }
  }
  
}