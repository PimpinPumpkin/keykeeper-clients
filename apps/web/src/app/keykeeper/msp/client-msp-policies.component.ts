import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { toObservable, toSignal } from "@angular/core/rxjs-interop";
import { catchError, combineLatest, from, of, switchMap } from "rxjs";

import { PolicyService } from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";
import { Organization } from "@bitwarden/common/admin-console/models/domain/organization";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { getUserId } from "@bitwarden/common/auth/services/account.service";
import { CalloutModule } from "@bitwarden/components";

import { ClientMsp, KeykeeperMspApiService } from "./msp-api.service";

/**
 * Keykeeper: on a client organization's Policies page, that its MSP sets
 * default policies, how a policy changed here becomes the organization's own,
 * and which ones already are. See DESIGN.md, "Default policies".
 */
@Component({
  selector: "app-keykeeper-client-msp-policies",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CalloutModule],
  template: `
    @if (info()?.msp; as msp) {
      <bit-callout type="info" [title]="null" data-testid="client-msp-policies">
        <p class="tw-mb-0">
          {{ msp.name }} sets default policies for this organization. A policy follows
          {{ msp.name }}'s default until someone changes it here. Then it's this organization's own
          setting, and {{ msp.name }}'s changes to that default skip it.
          @if (ownNames(); as names) {
            Own settings here: {{ names }}.
          }
        </p>
      </bit-callout>
    }
  `,
})
export class KeykeeperClientMspPoliciesComponent {
  readonly organization = input.required<Organization>();

  /** Fetched again whenever a policy is saved, so its own settings stay current. */
  protected readonly info = toSignal(
    combineLatest([
      toObservable(this.organization),
      this.accountService.activeAccount$.pipe(
        getUserId,
        switchMap((userId) => this.policyService.policies$(userId)),
      ),
    ]).pipe(
      switchMap(([org]) =>
        // The server tells only owners and admins, and a refusal would sign others out.
        org.isOwner || org.isAdmin
          ? from(this.mspApi.getOrganizationMsp(org.id)).pipe(catchError(() => of(null)))
          : of(null),
      ),
    ),
    { initialValue: null as ClientMsp | null },
  );

  protected readonly ownNames = computed(() =>
    (this.info()?.ownPolicies ?? []).map((p) => p.name).join(", "),
  );

  constructor(
    private readonly mspApi: KeykeeperMspApiService,
    private readonly accountService: AccountService,
    private readonly policyService: PolicyService,
  ) {}
}
