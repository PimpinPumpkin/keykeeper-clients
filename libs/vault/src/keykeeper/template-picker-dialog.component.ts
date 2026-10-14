import { ChangeDetectionStrategy, Component, signal } from "@angular/core";

import { ButtonModule, DialogModule, DialogRef, DialogService } from "@bitwarden/components";

import { KeykeeperTemplateChooserComponent } from "./template-chooser.component";
import { ItemTemplate, TemplateBase } from "./templates";

export type TemplatePickerResult =
  { kind: "use"; template: ItemTemplate } | { kind: "create"; base: TemplateBase };

/** Keykeeper: choose a template for a new item, or start a new custom template. */
@Component({
  selector: "vault-keykeeper-template-picker-dialog",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, DialogModule, KeykeeperTemplateChooserComponent],
  template: `
    <bit-dialog dialogSize="small">
      <span bitDialogTitle>{{ creating() ? "New template" : "New item from a template" }}</span>
      <div bitDialogContent>
        <vault-keykeeper-template-chooser
          [(creating)]="creating"
          (chosen)="choose($event)"
          (createRequested)="create($event)"
        ></vault-keykeeper-template-chooser>
      </div>
      <ng-container bitDialogFooter>
        <button bitButton buttonType="secondary" type="button" bitDialogClose>Cancel</button>
      </ng-container>
    </bit-dialog>
  `,
})
export class KeykeeperTemplatePickerDialogComponent {
  protected readonly creating = signal(false);

  constructor(private readonly dialogRef: DialogRef<TemplatePickerResult>) {}

  protected choose(template: ItemTemplate) {
    void this.dialogRef.close({ kind: "use", template });
  }

  protected create(base: TemplateBase) {
    void this.dialogRef.close({ kind: "create", base });
  }

  static open(dialogService: DialogService) {
    return dialogService.open<TemplatePickerResult>(KeykeeperTemplatePickerDialogComponent);
  }
}
