import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PolicyAnalyzer } from './policy-analyzer';

describe('PolicyAnalyzer', () => {
  let component: PolicyAnalyzer;
  let fixture: ComponentFixture<PolicyAnalyzer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PolicyAnalyzer]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PolicyAnalyzer);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
