import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";

import {
  BadgeComponent,
  CardComponent,
  SectionHeaderComponent,
  TypographyModule,
} from "@bitwarden/components";

import {
  expirationBadgeVariant,
  expirationLabel,
  expirationStatus,
  itemExpiration,
  ItemWithExpiration,
} from "./expiration";

/** Keykeeper: when an item expires, in the item view. Nothing shows when it doesn't. */
@Component({
  selector: "app-keykeeper-expiration",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, CardComponent, SectionHeaderComponent, TypographyModule],
  template: `
    @if (expiration(); as info) {
      <section class="tw-mb-5 bit-compact:tw-mb-4" data-testid="keykeeper-expiration">
        <bit-section-header>
          <h2 bitTypography="h6">Expiration</h2>
        </bit-section-header>
        <bit-card>
          <div class="tw-flex tw-items-center tw-gap-2">
            <span bitTypography="body1">{{ info.date }}</span>
            <span bitBadge [variant]="info.variant">{{ info.label }}</span>
          </div>
        </bit-card>
      </section>
    }
  `,
})
export class KeykeeperExpirationViewComponent {
  readonly cipher = input<ItemWithExpiration | null>(null);

  protected readonly expiration = computed(() => {
    const expires = itemExpiration(this.cipher());
    if (!expires) {
      return null;
    }
    const status = expirationStatus(expires);
    return {
      date: new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(expires),
      label: expirationLabel(status),
      variant: expirationBadgeVariant(status),
    };
  });
}
