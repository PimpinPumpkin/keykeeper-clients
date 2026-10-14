import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";

import { BadgeComponent } from "@bitwarden/components";

import {
  expirationBadgeVariant,
  expirationLabel,
  expirationStatus,
  itemExpiration,
  ItemWithExpiration,
} from "./expiration";

/**
 * Keykeeper: a badge for item lists, shown only when an item has expired or
 * expires within the next 30 days.
 */
@Component({
  selector: "vault-keykeeper-expiration-badge",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  template: `
    @if (badge(); as b) {
      <span bitBadge [variant]="b.variant" data-testid="keykeeper-expiration-badge">{{
        b.label
      }}</span>
    }
  `,
})
export class KeykeeperExpirationBadgeComponent {
  readonly item = input<ItemWithExpiration | null>(null);

  protected readonly badge = computed(() => {
    const expires = itemExpiration(this.item());
    if (!expires) {
      return null;
    }
    const status = expirationStatus(expires);
    return status.state === "later"
      ? null
      : { label: expirationLabel(status), variant: expirationBadgeVariant(status) };
  });
}
