import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  ApexAxisChartSeries,
  ApexChart,
  ChartComponent,
  ApexDataLabels,
  ApexPlotOptions,
  ApexYAxis,
  ApexLegend,
  ApexStroke,
  ApexXAxis,
  ApexFill,
  ApexTooltip,
  ApexTitleSubtitle,
} from 'ng-apexcharts';
import { environment } from 'src/environments/environment';

export type ChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  dataLabels: ApexDataLabels;
  plotOptions: ApexPlotOptions;
  yaxis: ApexYAxis;
  xaxis: ApexXAxis;
  fill: ApexFill;
  tooltip: ApexTooltip;
  stroke: ApexStroke;
  legend: ApexLegend;
  title: ApexTitleSubtitle;
  colors: string[];
};

@Component({
  selector: 'app-column-chart',
  templateUrl: './column-chart.component.html',
  styleUrls: ['./column-chart.component.scss'],
})
export class ColumnChartComponent implements OnChanges {
  @ViewChild('chart') chart!: ChartComponent;
  @Input() reportType: string = 'monthly';
  @Input() selectedTeam: string[] = []; // Team filter
  @Input() selectedPC: string[] = []; // PC filter
  @Input() startDate: string = ''; // Start date filter
  @Input() endDate: string = ''; // End date filter

  public chartOptions: Partial<ChartOptions> = {};
  private months: string[] = [];

  constructor(private http: HttpClient) { }

  ngOnInit() {
    this.fetchChartData(); // Fetch data when component loads
  }

  ngOnChanges(changes: SimpleChanges) {
    if (
      changes['reportType'] ||
      changes['selectedTeam'] ||
      changes['selectedPC'] ||
      changes['startDate'] ||
      changes['endDate']
    ) {
      this.fetchChartData();
    }
  }

  fetchChartData() {
    let params = new HttpParams();

    if (this.selectedTeam && this.selectedTeam.length > 0) {
      this.selectedTeam.forEach(team => {
        params = params.append('team', team);
      });
    }
    if (this.selectedPC && this.selectedPC.length > 0) {
      this.selectedPC.forEach(pc => {
        params = params.append('pc', pc);
      });
    }
    if (this.startDate) {
      params = params.set('start_date', this.startDate);
    }
    if (this.endDate) {
      params = params.set('end_date', this.endDate);
    }

    this.http
      .get<{ [key: string]: { approved: number; rejected: number } }>(
        `${environment.apiUrl}/api/monthly-drawing-status`,
        { params: params }
      )
      .subscribe((response) => {
        // Convert month labels to date objects to sort
        const sortedKeys = Object.keys(response).sort((a, b) => {
          const parse = (str: string) => new Date(`01-${str}`); // Converts 'Apr-2025' to valid Date
          return parse(a).getTime() - parse(b).getTime();
        });

        this.months = sortedKeys;
        const approvedData = this.months.map(
          (month) => response[month]?.approved || 0
        );
        const rejectedData = this.months.map(
          (month) => response[month]?.rejected || 0
        );

        this.chartOptions = {
          series: [
            { name: 'Approved', data: approvedData },
            { name: 'Rejected', data: rejectedData },
          ],
          chart: { type: 'bar', height: 350, stacked: true },
          title: { text: 'Monthly Drawing Status', align: 'center' },
          plotOptions: { 
            bar: { 
              dataLabels: { 
                position: 'center',
                total: {
                  enabled: true,
                  style: { color: '#000', fontSize: '13px', fontWeight: 600 }
                }
              } 
            } 
          },
          dataLabels: { enabled: true },
          xaxis: { categories: this.months },
          yaxis: { title: { text: 'Count' } },
          fill: { opacity: 1, colors: ['#1CC487', '#F45463'] },
          tooltip: { y: { formatter: (val) => `${val} ` } },
          legend: {
            position: 'top',
            markers: {
              fillColors: ['#1CC487', '#F45463'],
            },
          },
          colors: ['#28a745', '#dc3545'],
        } as Partial<ChartOptions>;
      });
  }

}
