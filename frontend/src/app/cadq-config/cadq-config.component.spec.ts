import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CadqConfigComponent } from './cadq-config.component';

describe('CadqConfigComponent', () => {
  let component: CadqConfigComponent;
  let fixture: ComponentFixture<CadqConfigComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [CadqConfigComponent]
    });
    fixture = TestBed.createComponent(CadqConfigComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
