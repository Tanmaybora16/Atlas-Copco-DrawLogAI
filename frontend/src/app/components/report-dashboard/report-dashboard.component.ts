import { Component, Input, OnChanges, SimpleChanges, OnInit } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexXAxis,
  ApexPlotOptions,
  ApexTooltip,
  ApexStroke,
  ApexYAxis,
  ApexTitleSubtitle,
  ApexLegend,
  ApexResponsive,
  ApexFill,
  ApexMarkers
} from 'ng-apexcharts';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { environment } from 'src/environments/environment';

export type ChartOptions = {
  series: ApexAxisChartSeries | any[];
  chart: ApexChart;
  dataLabels: ApexDataLabels;
  plotOptions: ApexPlotOptions;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis | ApexYAxis[];
  title: ApexTitleSubtitle;
  colors?: string[];
  tooltip?: ApexTooltip;
  legend?: ApexLegend;
  stroke?: ApexStroke;
  responsive?: ApexResponsive[];
  fill?: ApexFill;
  markers?: ApexMarkers;
  labels?: string[];
};

@Component({
  selector: 'app-report-dashboard',
  templateUrl: './report-dashboard.component.html',
  styleUrls: ['./report-dashboard.component.scss']
})
export class ReportDashboardComponent implements OnChanges, OnInit {
  @Input() startDate: string = '';
  @Input() endDate: string = '';
  @Input() selectedTeams: string[] = [];

  loading = false;
  error: string | null = null;
  data: any = null;

  // Chart Options
  public gaugeTotalOptions!: Partial<ChartOptions>;
  public gaugeQualityOptions!: Partial<ChartOptions>;
  public treemapOptions!: Partial<ChartOptions>;
  public statusOptions!: Partial<ChartOptions>;
  public leaderboardOptions!: Partial<ChartOptions>;
  public trendOptions!: Partial<ChartOptions>;

  private readonly API_BASE = `${environment.apiUrl}`;

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.fetchDashboardData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['startDate'] || changes['endDate'] || changes['selectedTeams']) {
      this.fetchDashboardData();
    }
  }

  fetchDashboardData(): void {
    this.loading = true;
    this.error = null;

    let params = new HttpParams();
    if (this.startDate) params = params.set('start_date', this.startDate);
    if (this.endDate) params = params.set('end_date', this.endDate);
    if (this.selectedTeams && this.selectedTeams.length > 0) {
      this.selectedTeams.forEach(t => params = params.append('team', t));
    }

    this.http.get<any>(`${this.API_BASE}/api/overview-dashboard`, { params })
      .pipe(catchError((err) => {
        console.error('Dashboard API Error:', err);
        this.error = 'Failed to load dashboard data';
        return of(null);
      }))
      .subscribe(res => {
        if (res) {
          this.data = res;
          this.initCharts();
        }
        this.loading = false;
      });
  }

  private initCharts(): void {
    const kpi = this.data.kpis;

    // 1. Total Audits Gauge
    this.gaugeTotalOptions = {
      series: [70], // We can use % of a target, or just show the number
      chart: { type: 'radialBar', height: 240, sparkline: { enabled: true } },
      plotOptions: {
        radialBar: {
          startAngle: -90,
          endAngle: 90,
          track: { background: "#e7e7e7", strokeWidth: '97%', margin: 5 },
          dataLabels: {
            name: { show: false },
            value: { offsetY: -2, fontSize: '22px', formatter: () => kpi.totalAudits.toString() }
          }
        }
      },
      fill: { colors: ['#2E93fA'] },
      labels: ['Average Results'],
    };

    // 2. Quality Score Gauge
    this.gaugeQualityOptions = {
      series: [kpi.passRatio],
      chart: { type: 'radialBar', height: 240, sparkline: { enabled: true } },
      plotOptions: {
        radialBar: {
          startAngle: -90,
          endAngle: 90,
          track: { background: "#e7e7e7", strokeWidth: '97%', margin: 5 },
          dataLabels: {
            name: { show: false },
            value: { offsetY: -2, fontSize: '22px', formatter: (val) => val + '%' }
          }
        }
      },
      fill: {
        type: 'gradient',
        gradient: {
          shade: 'dark',
          type: 'horizontal',
          shadeIntensity: 0.5,
          gradientToColors: ['#00E396'],
          inverseColors: true,
          opacityFrom: 1,
          opacityTo: 1,
          stops: [0, 100],
          colorStops: [
            { offset: 0, color: "#FF4560", opacity: 1 },
            { offset: 50, color: "#FEB019", opacity: 1 },
            { offset: 100, color: "#00E396", opacity: 1 }
          ]
        } as any
      }
    };

    // 3. Team Contribution (formerly Treemap)
    this.treemapOptions = {
      series: [
        {
          name: 'Accept',
          data: this.data.teamDistribution.map((t: any) => t.accept)
        },
        {
          name: 'Reject',
          data: this.data.teamDistribution.map((t: any) => t.reject)
        }
      ],
      chart: { type: 'bar', height: 350, stacked: true, toolbar: { show: false } },
      plotOptions: {
        bar: {
          columnWidth: '45%',
          dataLabels: {
            total: {
              enabled: true,
              style: {
                fontSize: '12px',
                fontWeight: 900,
                color: '#333'
              }
            }
          }
        }
      },
      dataLabels: { enabled: true },
      legend: { show: true, position: 'top', horizontalAlign: 'right' },
      xaxis: {
        categories: this.data.teamDistribution.map((t: any) => t.team),
        labels: { style: { fontSize: '12px' } }
      },
      title: { text: 'TEAM CONTRIBUTION', align: 'left', style: { fontSize: '14px', color: '#666' } },
      colors: ['#00E396', '#FF4560']
    };

    // 4. Status Distribution (Horizontal Bar)
    const statusColors: { [key: string]: string } = {
      'Correct': '#00E396',
      'Wrong': '#FF4560',
      'In Progress': '#FEB019'
    };
    const mappedColors = this.data.statusDistribution.map((s: any) => statusColors[s.status] || '#00E396');

    this.statusOptions = {
      series: [{
        name: 'Count',
        data: this.data.statusDistribution.map((s: any) => s.count)
      }],
      chart: { type: 'bar', height: 350, toolbar: { show: false } },
      plotOptions: { bar: { horizontal: true, distributed: true, dataLabels: { position: 'top' } } },
      dataLabels: { enabled: true, offsetX: -6, style: { fontSize: '12px', colors: ['#fff'] } },
      xaxis: { categories: this.data.statusDistribution.map((s: any) => s.status) },
      colors: mappedColors,
      legend: { show: false },
      title: { text: 'DRAWING STATUS DISTRIBUTIONS', align: 'left', style: { fontSize: '14px', color: '#666' } }
    };

    // 5. Auditor Leaderboard (Vertical Bar)
    this.leaderboardOptions = {
      series: [{
        name: 'Work Volume',
        data: this.data.auditorLeaderboard.map((a: any) => a.count)
      }],
      chart: { type: 'bar', height: 350, toolbar: { show: false } },
      plotOptions: { bar: { columnWidth: '45%', distributed: true } },
      dataLabels: { enabled: false },
      legend: { show: false },
      xaxis: {
        categories: this.data.auditorLeaderboard.map((a: any) => a.name),
        labels: { rotate: -45, style: { fontSize: '10px' } }
      },
      title: { text: 'REVIEWER PERFORMANCE', align: 'left', style: { fontSize: '14px', color: '#666' } }
    };

    // 6. Monthly Trend (Line)
    this.trendOptions = {
      series: [{
        name: 'Quality Score (%)',
        data: this.data.monthlyTrend.map((m: any) => Math.round(m.pass_ratio))
      }],
      chart: { type: 'line', height: 350, toolbar: { show: false }, zoom: { enabled: false } },
      dataLabels: { enabled: true },
      stroke: { curve: 'smooth', width: 3 },
      markers: { size: 5 },
      xaxis: { categories: this.data.monthlyTrend.map((m: any) => m.month) },
      yaxis: { min: 0, max: 100, title: { text: 'Pass Ratio %' } },
      title: { text: 'QUALITY TREND (MONTHLY)', align: 'left', style: { fontSize: '14px', color: '#666' } },
      colors: ['#008FFB']
    };
  }
}
