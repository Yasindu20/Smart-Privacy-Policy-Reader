import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PolicyResults } from './policy-results';

describe('PolicyResults', () => {
  let component: PolicyResults;
  let fixture: ComponentFixture<PolicyResults>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PolicyResults]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PolicyResults);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
