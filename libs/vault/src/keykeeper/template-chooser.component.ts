import { AsyncPipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, model, output } from "@angular/core";
import { combineLatest, from, map, startWith, switchMap } from "rxjs";

import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { getUserId } from "@bitwarden/common/auth/services/account.service";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { ButtonModule, TypographyModule } from "@bitwarden/components";

import { BUILT_IN_TEMPLATES, ItemTemplate, TemplateBase, templateGroups } from "./templates";

/**
 * Keykeeper: the list of templates to start a new item from, grouped, and the
 * first step of creating a custom template. The web vault shows it in a
 * dialog, the browser extension on a page.
 */
@Component({
  selector: "vault-keykeeper-template-chooser",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AsyncPipe, ButtonModule, TypographyModule],
  template: `
    @if (creating()) {
      <p bitTypography="body1">New items from this template will be:</p>
      <div class="tw-flex tw-flex-col tw-gap-2">
        <button
          bitButton
          buttonType="secondary"
          type="button"
          startIcon="bwi-globe"
          (click)="createRequested.emit('login')"
        >
          Logins
        </button>
        <button
          bitButton
          buttonType="secondary"
          type="button"
          startIcon="bwi-sticky-note"
          (click)="createRequested.emit('note')"
        >
          Notes
        </button>
      </div>
      <p bitTypography="helper" class="tw-mt-3">
        Logins have a username, password, and website. Next, name the template and add the fields
        new items should start with. Values you enter become defaults.
      </p>
      <button bitButton buttonType="secondary" type="button" (click)="creating.set(false)">
        Back
      </button>
    } @else {
      @for (group of groups$ | async; track group.name) {
        <section [attr.aria-label]="group.name" class="tw-mb-3">
          <h3 bitTypography="h6" class="tw-mb-1">{{ group.name }}</h3>
          <ul class="tw-m-0 tw-list-none tw-p-0">
            @for (template of group.templates; track template.source?.cipherId ?? template.id) {
              <li>
                <button
                  type="button"
                  class="tw-flex tw-w-full tw-items-center tw-gap-3 tw-rounded tw-border-none tw-bg-transparent tw-p-2 tw-text-left tw-text-main hover:tw-bg-bg-secondary"
                  (click)="chosen.emit(template)"
                >
                  <i class="bwi bwi-fw {{ template.icon }}" aria-hidden="true"></i>
                  <span>{{ template.name }}</span>
                </button>
              </li>
            }
          </ul>
        </section>
      }
      <button
        bitButton
        buttonType="secondary"
        type="button"
        startIcon="bwi-plus"
        (click)="creating.set(true)"
      >
        Create template
      </button>
    }
  `,
})
export class KeykeeperTemplateChooserComponent {
  /** Whether the person is choosing what a new template's items will be. */
  readonly creating = model(false);
  readonly chosen = output<ItemTemplate>();
  readonly createRequested = output<TemplateBase>();

  protected readonly groups$ = this.accountService.activeAccount$.pipe(
    getUserId,
    switchMap((userId) =>
      combineLatest([
        from(this.cipherService.getAllDecrypted(userId)),
        this.organizationService.organizations$(userId),
      ]),
    ),
    map(([items, organizations]) => templateGroups(items, organizations)),
    startWith([{ name: "Built-in", templates: BUILT_IN_TEMPLATES }]),
  );

  constructor(
    private readonly accountService: AccountService,
    private readonly cipherService: CipherService,
    private readonly organizationService: OrganizationService,
  ) {}
}
