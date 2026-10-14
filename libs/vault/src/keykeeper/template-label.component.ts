import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";

import { BadgeComponent } from "@bitwarden/components";

import { templateOf } from "./templates";

/** Keykeeper: which template an item came from, in the item view. */
@Component({
  selector: "app-keykeeper-template-label",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  template: `
    @if (template(); as t) {
      <p class="tw-mb-4" data-testid="keykeeper-template">
        <span bitBadge variant="subtle"
          ><i class="bwi {{ t.icon }} tw-mr-1" aria-hidden="true"></i>{{ t.name }}</span
        >
      </p>
    }
  `,
})
export class KeykeeperTemplateLabelComponent {
  readonly cipher = input<{
    fields?: { name?: string | null; value?: string | null }[] | null;
  } | null>(null);

  protected readonly template = computed(() => templateOf(this.cipher()));
}
