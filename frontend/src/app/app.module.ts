import { HttpClientModule } from '@angular/common/http'; 
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { LineChartComponent } from './components/line-chart/line-chart.component';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { UploadsComponent } from './uploads/uploads.component';
import { ReportsComponent } from './reports/reports.component';
import { HeaderComponent } from './components/header/header.component';
import { FormsModule } from '@angular/forms';
import { ErrorCodeComponent } from './components/error-code/error-code.component';
import { NgApexchartsModule } from "ng-apexcharts";
import { BarChartComponent } from './components/bar-chart/bar-chart.component';
import { ColumnChartComponent } from './components/column-chart/column-chart.component';
import { EmployeeComponent } from './employee/employee.component';
import { AdminLoginComponent } from './admin-login/admin-login.component'
import { AuthService } from './auth.service';
import { TableComponent } from './components/table/table.component';
import { ReportChartsComponent } from './components/report-charts/report-charts.component';
import { ReportTableComponent } from './components/report-table/report-table.component';
import { ChangePasswordComponent } from './components/change-password/change-password.component';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password.component';
import { SubmissionComponent } from './submission/submission.component';
import { RequestsComponent } from './requests/requests.component';
import { CanvasComponent } from './canvas/canvas.component';


@NgModule({
  declarations: [
    AppComponent,
    UploadsComponent,
    ReportsComponent,
    HeaderComponent,
    ErrorCodeComponent,
    BarChartComponent,
    ColumnChartComponent,
    EmployeeComponent,
    AdminLoginComponent,
    TableComponent,
    LineChartComponent,
    ReportChartsComponent,
    ReportTableComponent,
    ChangePasswordComponent,
    ForgotPasswordComponent,
    SubmissionComponent,
    RequestsComponent,
    CanvasComponent

  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    NgApexchartsModule,
    HttpClientModule,
],
providers: [AuthService],
  bootstrap: [AppComponent]
})
export class AppModule { }
