// import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
// import { HttpClient, HttpParams } from '@angular/common/http';
// import {
//   ApexAxisChartSeries,
//   ApexChart,
//   ApexDataLabels,
//   ApexXAxis,
//   ApexPlotOptions,
// } from 'ng-apexcharts';
// import { environment } from 'src/environments/environment';

// export type ChartOptions = {
//   series: ApexAxisChartSeries;
//   chart: ApexChart;
//   dataLabels: ApexDataLabels;
//   plotOptions: ApexPlotOptions;
//   xaxis: ApexXAxis;
//   title: any;
// };

// @Component({
//   selector: 'app-bar-chart',
//   templateUrl: './bar-chart.component.html',
//   styleUrls: ['./bar-chart.component.scss'],
// })
// export class BarChartComponent implements OnChanges {
//   @Input() reportType!: string;
//   @Input() selectedDivision!: string;
//   @Input() selectedPC!: string;
//   @Input() startDate!: string;
//   @Input() endDate!: string;

//   public chartOptions!: Partial<ChartOptions>;

//   constructor(private http: HttpClient) {}

//   ngOnChanges(changes: SimpleChanges) {
//     if (
//       changes['reportType'] || 
//       changes['selectedDivision'] || 
//       changes['selectedPC'] || 
//       changes['startDate'] || 
//       changes['endDate']
//     ) {
//       this.fetchReportData();
//     }
//   }

//   fetchReportData() {
//     let apiUrl =
//       this.reportType === 'monthly'
//         ? `${environment.apiUrl}/api/monthly-error-report`
//         : `${environment.apiUrl}/api/trend-error-report`;

//     let params = new HttpParams();
//     if (this.startDate) params = params.set('start_date', this.startDate);
//     if (this.endDate) params = params.set('end_date', this.endDate);
//     if (this.selectedDivision) params = params.set('division', this.selectedDivision);
//     if (this.selectedPC) params = params.set('pc', this.selectedPC);

//     this.http.get<any[]>(apiUrl, { params }).subscribe(
//       (response) => {
//         console.log(`✅ Fetched ${this.reportType} Data:`, response);
//         this.updateChartData(response);
//       },
//       (error) => {
//         console.error('🔴 Error fetching data:', error);
//       }
//     );
//   }

//   updateChartData(reports: any[]) {
//     if (this.reportType === 'monthly') {
//       // Sort chronologically by date
//       reports.sort((a, b) => {
//         const [m1, y1] = a.month.split('-');
//         const [m2, y2] = b.month.split('-');
//         return new Date(`${y1}-${m1}-01`).getTime() - new Date(`${y2}-${m2}-01`).getTime();
//       });

//       let data: number[] = [];
//       let categories: string[] = [];

//       reports.forEach((report) => {
//         const [month, year] = report.month.split('-');
//         const date = new Date(`${year}-${month}-01`);
//         const formatted = date.toLocaleString('en-US', { month: 'short', year: 'numeric' }); // MMM YYYY
//         categories.push(formatted);
//         data.push(report.total_errors);
//       });

//       this.chartOptions = {
//         series: [{ name: 'Total Errors', data }],
//         chart: { type: 'bar', height: 350 },
//         title: { text: 'Monthly Error Count', align: 'center' },
//         plotOptions: { bar: { horizontal: false } },
//         dataLabels: { enabled: true },
//         xaxis: { categories },
//       };
//     } else {
//       // Top 10 error codes
//       let filteredReports = reports.filter(report => report.count > 1)
//                                   .sort((a, b) => b.count - a.count)
//                                   .slice(0, 10);
//       let data: number[] = [];
//       let categories: string[] = [];

//       filteredReports.forEach((report) => {
//         categories.push(report.error_code);
//         data.push(report.count);
//       });

//       this.chartOptions = {
//         series: [{ name: 'Error Code Count', data }],
//         chart: { type: 'bar', height: 350 },
//         title: { text: 'Top 10 Error Codes', align: 'center' },
//         plotOptions: { bar: { horizontal: false, columnWidth: '60%' } },
//         dataLabels: { enabled: true },
//         xaxis: {
//           categories,
//           labels: { rotate: -45, hideOverlappingLabels: true, trim: true },
//         },
//       };
//     }
//   }

// }

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
import { environment } from 'src/environments/environment';

export type ChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  dataLabels: ApexDataLabels;
  plotOptions: ApexPlotOptions;
  xaxis: ApexXAxis;
  title: any;
  tooltip?: ApexTooltip;
};

@Component({
  selector: 'app-bar-chart',
  templateUrl: './bar-chart.component.html',
  styleUrls: ['./bar-chart.component.scss'],
})
export class BarChartComponent implements OnChanges {
  @Input() reportType!: string;
  @Input() selectedTeam!: string;
  @Input() selectedPC!: string;
  @Input() startDate!: string;
  @Input() endDate!: string;

  public chartOptions!: Partial<ChartOptions>;

  // Error code descriptions
  private errorDescriptions: { [key: string]: string } = {
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

  constructor(private http: HttpClient) { }

  ngOnChanges(changes: SimpleChanges) {
    if (
      changes['reportType'] ||
      changes['selectedTeam'] ||
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
    if (this.selectedTeam) params = params.set('team', this.selectedTeam);
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
        tooltip: {
          y: {
            formatter: function (value: number, { seriesIndex, dataPointIndex, w }: any) {
              const category = w.globals.labels[dataPointIndex];
              return `${value} error${value !== 1 ? 's' : ''} in ${category}`;
            }
          }
        }
      };
    } else {
      // Top 10 error codes
      let filteredReports = reports.filter(report => report.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      let data: number[] = [];
      let categories: string[] = [];

      filteredReports.forEach((report) => {
        categories.push(report.error_code);
        data.push(report.count);
      });

      // Create reference to errorDescriptions for use in tooltip
      const errorDescriptions = this.errorDescriptions;

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
        // Alternative compact tooltip design
        // Replace the tooltip section in the Top 10 Error Codes chart with this:
        tooltip: {
          custom: function ({ series, seriesIndex, dataPointIndex, w }: any) {
            const errorCode = w.globals.labels[dataPointIndex];
            const count = series[seriesIndex][dataPointIndex];
            const total = series[0].reduce((a: number, b: number) => a + b, 0);
            const percentage = ((count / total) * 100).toFixed(1);
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
                  border-top: 1px solid rgba(255,255,255,0.42);
                ">
                  <span>${count} occurrence${count !== 1 ? 's' : ''}</span>
                  <span>${percentage}% of total</span>
                </div>
              </div>
            `;
          }
        }
      };
    }
  }

}