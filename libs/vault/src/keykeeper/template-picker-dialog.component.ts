import { ChangeDetectionStrategy, Component } from "@angular/core";

import { ButtonModule, DialogModule, DialogRef, DialogService } from "@bitwarden/components";

import { BUILT_IN_TEMPLATES, ItemTemplate } from "./templates";

/** Keykeeper: choose a template for a new item. Closes with the chosen template. */
@Component({
  selector: "vault-keykeeper-template-picker-dialog",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, DialogModule],
  template: `
    <bit-dialog dialogSize="small">
      <span bitDialogTitle>New item from a template</span>
      <div bitDialogContent>
        <ul class="tw-m-0 tw-list-none tw-p-0">
          @for (template of templates; track template.id) {
            <li>
              <button
                type="button"
                class="tw-flex tw-w-full tw-items-center tw-gap-3 tw-rounded tw-border-none tw-bg-transparent tw-p-2 tw-text-left hover:tw-bg-bg-secondary"
                (click)="choose(template)"
              >
                <i class="bwi bwi-fw {{ template.icon }}" aria-hidden="true"></i>
                <span>{{ template.name }}</span>
              </button>
            </li>
          }
        </ul>
      </div>
      <ng-container bitDialogFooter>
        <button bitButton buttonType="secondary" type="button" bitDialogClose>Cancel</button>
      </ng-container>
    </bit-dialog>
  `,
})
export class KeykeeperTemplatePickerDialogComponent {
  protected readonly templates = BUILT_IN_TEMPLATES;

  constructor(private readonly dialogRef: DialogRef<ItemTemplate>) {}

  protected choose(template: ItemTemplate) {
    void this.dialogRef.close(template);
  }

  static open(dialogService: DialogService) {
    return dialogService.open<ItemTemplate>(KeykeeperTemplatePickerDialogComponent);
  }
}
