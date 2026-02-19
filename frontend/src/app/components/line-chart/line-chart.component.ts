
// import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
// import { ApexOptions } from 'ng-apexcharts';
// import { HttpClient } from '@angular/common/http';

// @Component({
//   selector: 'app-line-chart',
//   templateUrl: './line-chart.component.html',
//   styleUrls: ['./line-chart.component.scss']
// })
// export class LineChartComponent implements OnChanges {
//   @Input() selectedDivision!: string;
//   @Input() selectedPC!: string;
//   @Input() startDate!: string;
//   @Input() endDate!: string;

//   chartOptions: ApexOptions = {
//     chart: {
//       type: 'line',
//       height: 350
//     },
//     xaxis: {
//       categories: []
//     },
//     series: [],
//     colors: ['#28a745', '#dc3545'],
//     dataLabels: {
//       enabled: false
//     },
//     stroke: {
//       curve: 'smooth'
//     },
//     title: {
//       text: 'Drawings Trend',
//       align: 'center'
//     }
//   };

//   apiUrl = 'http://localhost:5000/api/drawings-trend';

//   constructor(private http: HttpClient) {}

//   ngOnChanges(changes: SimpleChanges) {
//     if (changes['selectedDivision'] || changes['selectedPC'] || changes['startDate'] || changes['endDate']) {
//       this.fetchData();
//     }
//   }

//   fetchData() {
//     let params: any = {};
//     if (this.selectedDivision) params.division = this.selectedDivision;
//     if (this.selectedPC) params.pc = this.selectedPC;
//     if (this.startDate) params.start_date = this.startDate;
//     if (this.endDate) params.end_date = this.endDate;

//     this.http.get<any>(this.apiUrl, { params }).subscribe(response => {
//       if (response && response.categories && response.series) {
//         this.updateChart(response.categories, response.series);
//       } else {
//         console.error('Invalid response:', response);
//       }
//     }, error => {
//       console.error('API Error:', error);
//     });
//   }

//   updateChart(categories: string[], series: any[]) {
//     this.chartOptions = {
//       ...this.chartOptions, // Preserve existing options
//       xaxis: {
//         categories: categories
//       },
//       series: series.length ? series : [
//         { name: 'Approved Drawings', data: [] },
//         { name: 'Rejected Drawings', data: [] }
//       ]
//     };
//   }
// }


import { Component, Input, OnChanges, SimpleChanges, OnInit } from '@angular/core';
import { ApexOptions } from 'ng-apexcharts';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-line-chart',
  templateUrl: './line-chart.component.html',
  styleUrls: ['./line-chart.component.scss'],
})
export class LineChartComponent implements OnChanges, OnInit {
  @Input() selectedTeam: string[] = [];
  @Input() selectedPC: string[] = [];
  @Input() startDate!: string;
  @Input() endDate!: string;

  chartOptions: ApexOptions = {
    chart: {
      type: 'line',
      height: 350,
      toolbar: {
        show: true,
        tools: {
          download: false,
          selection: false,
          zoom: false,
          zoomin: false,
          zoomout: false,
          pan: false,
          reset: false,
          customIcons: [], // Just hamburger icon will remain
        },
      },
    },
    xaxis: {
      categories: [],
    },
    series: [],
    colors: ['#28a745', '#dc3545'], // ✅ Green for Approved, Red for Rejected
    dataLabels: {
      enabled: false,
    },
    stroke: {
      curve: 'smooth',
      width: 4,
    },
    title: {
      text: 'Drawings Trend',
      align: 'center',
    },
  };

  apiUrl = `${environment.apiUrl}/api/drawings-trend`;

  constructor(private http: HttpClient) { }

  ngOnInit() {
    this.fetchData(); // fetch on first load too
  }

  ngOnChanges(changes: SimpleChanges) {
    if (
      changes['selectedTeam'] ||
      changes['selectedPC'] ||
      changes['startDate'] ||
      changes['endDate']
    ) {
      this.fetchData();
    }
  }

  fetchData() {
    let params = new HttpParams();
    if (this.selectedTeam && this.selectedTeam.length > 0) {
      this.selectedTeam.forEach(t => params = params.append('team', t));
    }
    if (this.selectedPC && this.selectedPC.length > 0) {
      this.selectedPC.forEach(p => params = params.append('pc', p));
    }
    if (this.startDate) params = params.set('start_date', this.startDate);
    if (this.endDate) params = params.set('end_date', this.endDate);

    this.http.get<any>(this.apiUrl, { params }).subscribe(
      (response) => {
        const categories = response?.categories ?? [];
        const approvedData =
          response?.series?.find((s: any) => s.name === 'Approved Drawings')
            ?.data ?? [];
        const rejectedData =
          response?.series?.find((s: any) => s.name === 'Rejected Drawings')
            ?.data ?? [];

        this.chartOptions = {
          ...this.chartOptions,
          xaxis: { categories },
          series: [
            { name: 'Approved Drawings', data: approvedData },
            { name: 'Rejected Drawings', data: rejectedData },
          ],
        };
      },
      (error) => {
        console.error('API Error:', error);
      }
    );
  }
}
