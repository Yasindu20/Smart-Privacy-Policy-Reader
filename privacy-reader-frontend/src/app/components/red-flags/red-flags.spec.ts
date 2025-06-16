import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RedFlags } from './red-flags';

describe('RedFlags', () => {
  let component: RedFlags;
  let fixture: ComponentFixture<RedFlags>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RedFlags]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RedFlags);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
