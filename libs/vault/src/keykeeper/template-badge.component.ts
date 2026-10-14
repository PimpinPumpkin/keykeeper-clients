import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";

import { BadgeComponent } from "@bitwarden/components";

import { templateDefinition } from "./templates";

/** Keykeeper: marks custom templates in item lists. */
@Component({
  selector: "vault-keykeeper-template-badge",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  template: `
    @if (isTemplate()) {
      <span bitBadge variant="subtle" data-testid="keykeeper-template-badge">Template</span>
    }
  `,
})
export class KeykeeperTemplateBadgeComponent {
  readonly item = input<{
    fields?: { name?: string | null; value?: string | null }[] | null;
  } | null>(null);

  protected readonly isTemplate = computed(() => templateDefinition(this.item()) != null);
}
