import { ChangeDetectionStrategy, Component } from "@angular/core";
import { FormBuilder, Validators } from "@angular/forms";
import { Router } from "@angular/router";

import { ErrorResponse } from "@bitwarden/common/models/response/error.response";
import { ToastService } from "@bitwarden/components";

import { HeaderModule } from "../../layouts/header/header.module";
import { SharedModule } from "../../shared";
import { KeykeeperMspApiService } from "../msp/msp-api.service";

/**
 * Keykeeper: "New organization" on our own server. Upstream asks a self-hosted
 * server for a license file here, and its cloud form is about plans and
 * payment, neither of which applies. The organization's keys are made in the
 * browser with upstream's own code, as the MSP console's "Add client" does.
 * See DESIGN.md, "Joining".
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedModule, HeaderModule],
  template: `
    <app-header></app-header>
    <bit-container>
      <p bitTypography="body1">
        An organization shares items with the people you invite. Invite them from its Members page:
        they get in as soon as they accept, unless you ask for approval on its Settings page.
      </p>
      <form [formGroup]="form" [bitSubmit]="submit" class="tw-max-w-md">
        <bit-form-field>
          <bit-label>Organization name</bit-label>
          <input bitInput type="text" formControlName="name" />
        </bit-form-field>
        <button bitButton bitFormButton buttonType="primary" type="submit">
          Create organization
        </button>
      </form>
    </bit-container>
  `,
})
export class KeykeeperCreateOrganizationComponent {
  protected readonly form = this.formBuilder.nonNullable.group({
    name: ["", [Validators.required, Validators.maxLength(50)]],
  });

  constructor(
    private readonly formBuilder: FormBuilder,
    private readonly api: KeykeeperMspApiService,
    private readonly router: Router,
    private readonly toastService: ToastService,
  ) {}

  protected readonly submit = async () => {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const name = this.form.controls.name.value.trim();
    try {
      const id = await this.api.createOrganization(name);
      this.toastService.showToast({ variant: "success", message: `Created ${name}` });
      await this.router.navigate(["/organizations", id, "members"]);
    } catch (e) {
      const message = e instanceof ErrorResponse ? e.getSingleMessage() : String(e);
      this.toastService.showToast({ variant: "error", message });
    }
  };
}
