import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  output,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

import { KeykeeperMspWorkService } from "../msp/msp-work.service";

/**
 * Keykeeper: opening an organization's Members page lets in anyone waiting
 * whom this person can confirm (as opening the MSP console does), and tells
 * the page to reload its list when someone got in. Shows nothing. See
 * DESIGN.md, "Joining".
 */
@Component({
  selector: "app-keykeeper-members-joining",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: "",
})
export class KeykeeperMembersJoiningComponent implements OnInit {
  readonly joined = output<void>();

  private readonly work = inject(KeykeeperMspWorkService);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit() {
    this.work.updated$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.joined.emit());
    void this.work.run();
  }
}
