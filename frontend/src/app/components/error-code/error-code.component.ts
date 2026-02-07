// import { Component, Input, Output, EventEmitter } from '@angular/core';

// @Component({
//   selector: 'app-error-code',
//   templateUrl: './error-code.component.html',
//   styleUrls: ['./error-code.component.scss'],
// })
// // export class ErrorCodeComponent {
// //   @Input() errorCode: string = ''; // ✅ Accept the error code
// //   @Input() errorCount: number = 0; // ✅ Accept the count (optional)
// // }  
// export class ErrorCodeComponent {
//   @Input() errorCode!: string;
//   @Input() errorCount!: number;
//   @Output() errorDeleted = new EventEmitter<string>();

//   showDelete = false;

//   deleteError() {
//     this.errorDeleted.emit(this.errorCode);
//   }
// }

import { Component, Input, Output, EventEmitter  } from '@angular/core';

@Component({
  selector: 'app-error-code',
  templateUrl: './error-code.component.html',
  styleUrls: ['./error-code.component.scss'],
})
export class ErrorCodeComponent {
  @Input() errorCode: string = ''; // ✅ Accept the error code
  @Input() errorCount: number = 0; // ✅ Accept the count (optional)
  @Output() errorRemoved = new EventEmitter<string>(); // Emit event to parent when removed

  hover = false;

closeError() {
  console.log('Error closed');
  this.errorRemoved.emit(this.errorCode); // Send error code to parent for removal

  // Add logic to remove/hide the error container
}
}