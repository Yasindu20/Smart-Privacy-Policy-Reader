import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PolicyHistory } from './policy-history';

describe('PolicyHistory', () => {
  let component: PolicyHistory;
  let fixture: ComponentFixture<PolicyHistory>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PolicyHistory]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PolicyHistory);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
