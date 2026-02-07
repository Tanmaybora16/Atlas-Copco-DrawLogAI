import { Component } from '@angular/core';
import { NgbAlertModule, NgbDatepickerModule, NgbDateStruct } from '@ng-bootstrap/ng-bootstrap';
import { FormsModule } from '@angular/forms';
import { JsonPipe } from '@angular/common';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';



@Component({
  standalone:true,
  selector: 'app-date-picker',
	imports: [NgbDatepickerModule, NgbAlertModule, FormsModule, JsonPipe, NgbModule],
  templateUrl: './date-picker.component.html',
  styleUrls: ['./date-picker.component.scss']
})
export class DatePickerComponent {
	model!: NgbDateStruct;

}
