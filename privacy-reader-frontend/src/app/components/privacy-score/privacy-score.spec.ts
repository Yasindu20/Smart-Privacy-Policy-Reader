import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PrivacyScore } from './privacy-score';

describe('PrivacyScore', () => {
  let component: PrivacyScore;
  let fixture: ComponentFixture<PrivacyScore>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrivacyScore]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PrivacyScore);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
