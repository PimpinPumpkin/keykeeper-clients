import { ChangeDetectionStrategy, Component, OnInit, signal } from "@angular/core";
import { FormBuilder, Validators } from "@angular/forms";
import { firstValueFrom } from "rxjs";

import { ErrorResponse } from "@bitwarden/common/models/response/error.response";
import { EnvironmentService } from "@bitwarden/common/platform/abstractions/environment.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { DialogService, ToastService } from "@bitwarden/components";

import { HeaderModule } from "../../layouts/header/header.module";
import { SharedModule } from "../../shared";

import {
  ClientEnrollment,
  ClientPreset,
  KeykeeperMspApiService,
  MspClient,
  MspDetails,
  MspRole,
  MspStaffMember,
} from "./msp-api.service";

const CONFIRMED = 2;

/**
 * Keykeeper: the MSP console. Every client at a glance, with a way into each
 * client's admin console, plus the MSP's staff. Opening it confirms anyone
 * waiting for an org key that the signed-in person can give.
 */
@Component({
  selector: "app-keykeeper-msp",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedModule, HeaderModule],
  template: `
    <app-header></app-header>
    <bit-container>
      @if (loading()) {
        <bit-icon name="bwi-spinner" class="bwi-spin tw-text-muted" title="Loading"></bit-icon>
      } @else if (msp(); as m) {
        <p class="tw-mb-6" data-testid="msp-name">
          <span bitTypography="h2" class="tw-mr-2">{{ m.name }}</span>
          <span bitBadge variant="secondary">{{
            m.role === "admin" ? "Admin" : "Technician"
          }}</span>
        </p>

        <section class="tw-mb-8" aria-label="Clients">
          <h2 bitTypography="h3">Clients</h2>
          @if (m.clients.length === 0) {
            <p bitTypography="body1">No clients yet.</p>
          } @else {
            <bit-table>
              <ng-container header>
                <tr>
                  <th bitCell>Client</th>
                  <th bitCell>Members</th>
                  <th bitCell>Waiting</th>
                  <th bitCell>Invited</th>
                  <th bitCell></th>
                </tr>
              </ng-container>
              <ng-template body>
                @for (client of m.clients; track client.id) {
                  <tr bitRow [attr.data-testid]="'msp-client-' + client.name">
                    <td bitCell>
                      {{ client.name }}
                      @if (client.preset === "business") {
                        <span bitBadge variant="secondary" class="tw-ml-2" title="Business defaults"
                          >Business</span
                        >
                      }
                    </td>
                    <td bitCell data-testid="msp-client-members">{{ client.members.confirmed }}</td>
                    <td bitCell data-testid="msp-client-waiting">{{ client.members.accepted }}</td>
                    <td bitCell>{{ client.members.invited }}</td>
                    <td bitCell class="tw-text-right">
                      <button
                        type="button"
                        bitLink
                        class="tw-mr-4"
                        [attr.aria-expanded]="installFor()?.client.id === client.id"
                        (click)="toggleInstall(client)"
                      >
                        Install command
                      </button>
                      @if (client.you?.status === CONFIRMED) {
                        <a bitLink [routerLink]="['/organizations', client.id, 'members']">Open</a>
                      } @else {
                        <span class="tw-text-muted">Waiting for access</span>
                      }
                    </td>
                  </tr>
                }
              </ng-template>
            </bit-table>
          }
          @if (installFor(); as install) {
            <section
              class="tw-mt-4 tw-rounded-lg tw-border tw-border-solid tw-border-secondary-300 tw-p-4"
              aria-label="Install command"
              data-testid="msp-install"
            >
              <h3 bitTypography="h5">Install command for {{ install.client.name }}</h3>
              @if (install.enrollment.token; as token) {
                <p bitTypography="body2">
                  Run this from your RMM on {{ install.client.name }}'s computers, as an
                  administrator. It installs the extension in Edge and Chrome, turns off the
                  browsers' password managers, and anyone who then signs in joins
                  {{ install.client.name }}.
                </p>
                <pre
                  class="tw-whitespace-pre-wrap tw-break-all tw-rounded tw-bg-background-alt tw-p-3 tw-text-sm"
                  data-testid="msp-install-command"
                  >{{ installCommand(token) }}</pre>
                <p bitTypography="helper">
                  {{
                    install.enrollment.joins === 1
                      ? "1 person has"
                      : install.enrollment.joins + " people have"
                  }}
                  joined with this command. Anyone who has it can ask to join, so treat it like a
                  password.
                </p>
                <div class="tw-flex tw-gap-2">
                  <button
                    bitButton
                    buttonType="secondary"
                    type="button"
                    (click)="copyCommand(token)"
                  >
                    Copy command
                  </button>
                  @if (m.role === "admin") {
                    <button
                      bitButton
                      buttonType="danger"
                      type="button"
                      (click)="replaceToken(install.client)"
                    >
                      Replace token
                    </button>
                  }
                </div>
              } @else if (m.role === "admin") {
                <button
                  bitButton
                  buttonType="primary"
                  type="button"
                  (click)="replaceToken(install.client)"
                >
                  Create install command
                </button>
              } @else {
                <p bitTypography="body2">
                  Ask an MSP admin to create this client's install command.
                </p>
              }
            </section>
          }
          @if (m.role === "admin") {
            <form
              [formGroup]="clientForm"
              [bitSubmit]="addClient"
              class="tw-mt-4 tw-flex tw-items-end tw-gap-2"
            >
              <bit-form-field disableMargin class="tw-grow">
                <bit-label>New client's name</bit-label>
                <input bitInput formControlName="name" />
              </bit-form-field>
              <bit-form-field disableMargin class="tw-min-w-48">
                <bit-label>Defaults</bit-label>
                <select bitInput formControlName="preset">
                  <option value="business">Business (recommended)</option>
                  <option value="none">None</option>
                </select>
              </bit-form-field>
              <button bitButton bitFormButton buttonType="primary" type="submit">Add client</button>
            </form>
          }
        </section>

        <section aria-label="Staff">
          <h2 bitTypography="h3">Staff</h2>
          <bit-table>
            <ng-container header>
              <tr>
                <th bitCell>Name</th>
                <th bitCell>Role</th>
                <th bitCell></th>
              </tr>
            </ng-container>
            <ng-template body>
              @for (person of m.staff; track person.userId) {
                <tr bitRow [attr.data-testid]="'msp-staff-' + person.email">
                  <td bitCell>
                    <div>{{ person.name || person.email }}</div>
                    <div class="tw-text-sm tw-text-muted">{{ person.email }}</div>
                  </td>
                  <td bitCell>
                    @if (m.role === "admin") {
                      <select
                        bitInput
                        class="tw-min-w-36"
                        [attr.aria-label]="'Role for ' + person.email"
                        [value]="person.role"
                        (change)="changeRole(person, $any($event.target).value)"
                      >
                        <option value="admin">Admin</option>
                        <option value="technician">Technician</option>
                      </select>
                    } @else {
                      {{ person.role === "admin" ? "Admin" : "Technician" }}
                    }
                  </td>
                  <td bitCell class="tw-text-right">
                    @if (m.role === "admin") {
                      <button
                        type="button"
                        bitIconButton="bwi-trash"
                        buttonType="danger"
                        [label]="'Remove ' + person.email"
                        (click)="removeStaff(person)"
                      ></button>
                    }
                  </td>
                </tr>
              }
            </ng-template>
          </bit-table>
          @if (m.role === "admin") {
            <form
              [formGroup]="staffForm"
              [bitSubmit]="addStaff"
              class="tw-mt-4 tw-flex tw-items-end tw-gap-2"
            >
              <bit-form-field disableMargin class="tw-grow">
                <bit-label>Email of someone to add</bit-label>
                <input bitInput type="email" formControlName="email" />
              </bit-form-field>
              <bit-form-field disableMargin class="tw-min-w-36">
                <bit-label>Role</bit-label>
                <select bitInput formControlName="role">
                  <option value="technician">Technician</option>
                  <option value="admin">Admin</option>
                </select>
              </bit-form-field>
              <button bitButton bitFormButton buttonType="primary" type="submit">Add staff</button>
            </form>
          }
        </section>
      } @else {
        <bit-callout type="info" title="Set up your MSP">
          Run all of your clients from one place. You'll be an admin of your MSP, and you can add
          technicians next.
        </bit-callout>
        <form [formGroup]="mspForm" [bitSubmit]="createMsp" class="tw-flex tw-items-end tw-gap-2">
          <bit-form-field disableMargin class="tw-grow">
            <bit-label>Your MSP's name</bit-label>
            <input bitInput formControlName="name" />
          </bit-form-field>
          <button bitButton bitFormButton buttonType="primary" type="submit">Create MSP</button>
        </form>
      }
    </bit-container>
  `,
})
export class KeykeeperMspComponent implements OnInit {
  protected readonly CONFIRMED = CONFIRMED;
  protected readonly loading = signal(true);
  protected readonly msp = signal<MspDetails | null>(null);
  protected readonly installFor = signal<{
    client: MspClient;
    enrollment: ClientEnrollment;
  } | null>(null);
  private readonly serverUrl = signal("");

  protected readonly mspForm = this.formBuilder.group({
    name: ["", [Validators.required, Validators.maxLength(100)]],
  });
  protected readonly clientForm = this.formBuilder.group({
    name: ["", [Validators.required, Validators.maxLength(100)]],
    preset: ["business" as ClientPreset, Validators.required],
  });
  protected readonly staffForm = this.formBuilder.group({
    email: ["", [Validators.required, Validators.email]],
    role: ["technician" as MspRole, Validators.required],
  });

  constructor(
    private readonly mspApi: KeykeeperMspApiService,
    private readonly formBuilder: FormBuilder,
    private readonly toastService: ToastService,
    private readonly i18nService: I18nService,
    private readonly environmentService: EnvironmentService,
    private readonly platformUtilsService: PlatformUtilsService,
    private readonly dialogService: DialogService,
  ) {}

  async ngOnInit() {
    try {
      const [first] = await this.mspApi.list();
      if (first) {
        await this.confirmWaiting(first.id);
        await this.reload(first.id);
      }
    } catch (e) {
      this.showError(e);
    } finally {
      this.loading.set(false);
    }
  }

  protected readonly createMsp = async () => {
    if (this.mspForm.invalid) {
      this.mspForm.markAllAsTouched();
      return;
    }
    await this.attempt(async () => {
      const created = await this.mspApi.create(this.mspForm.value.name!.trim());
      await this.reload(created.id);
    });
  };

  protected readonly addClient = async () => {
    const msp = this.msp();
    if (this.clientForm.invalid || msp == null) {
      this.clientForm.markAllAsTouched();
      return;
    }
    await this.attempt(async () => {
      const name = this.clientForm.value.name!.trim();
      await this.mspApi.createClient(msp.id, name, this.clientForm.value.preset as ClientPreset);
      // Everyone else on staff joined the new client; give them its key now.
      await this.confirmWaiting(msp.id);
      this.clientForm.reset({ name: "", preset: "business" });
      await this.reload(msp.id);
      this.toast(`Added ${name}`);
    });
  };

  protected readonly addStaff = async () => {
    const msp = this.msp();
    if (this.staffForm.invalid || msp == null) {
      this.staffForm.markAllAsTouched();
      return;
    }
    await this.attempt(async () => {
      const email = this.staffForm.value.email!.trim();
      await this.mspApi.addStaff(msp.id, email, this.staffForm.value.role as MspRole);
      await this.confirmWaiting(msp.id);
      this.staffForm.reset({ email: "", role: "technician" });
      await this.reload(msp.id);
      this.toast(`Added ${email} to every client`);
    });
  };

  protected async changeRole(person: MspStaffMember, role: MspRole) {
    const msp = this.msp();
    if (msp == null || role === person.role) {
      return;
    }
    await this.attempt(async () => {
      await this.mspApi.changeRole(msp.id, person.userId, role);
      this.toast(`${person.email} is now ${role === "admin" ? "an admin" : "a technician"}`);
    });
    await this.reload(msp.id);
  }

  protected async removeStaff(person: MspStaffMember) {
    const msp = this.msp();
    if (msp == null) {
      return;
    }
    await this.attempt(async () => {
      await this.mspApi.removeStaff(msp.id, person.userId);
      await this.reload(msp.id);
      this.toast(`Removed ${person.email} from every client`);
    });
  }

  protected async toggleInstall(client: MspClient) {
    const msp = this.msp();
    if (msp == null) {
      return;
    }
    if (this.installFor()?.client.id === client.id) {
      this.installFor.set(null);
      return;
    }
    await this.attempt(async () => {
      const environment = await firstValueFrom(this.environmentService.environment$);
      this.serverUrl.set(environment.getWebVaultUrl());
      this.installFor.set({
        client,
        enrollment: await this.mspApi.getEnrollment(msp.id, client.id),
      });
    });
  }

  /** The command an MSP runs from their RMM; the script's name comes from the brand. */
  protected installCommand(token: string): string {
    const script = this.i18nService.t("keykeeperInstallScript");
    return `.\\${script} -ServerUrl ${this.serverUrl()} -EnrollmentToken ${token}`;
  }

  protected copyCommand(token: string) {
    this.platformUtilsService.copyToClipboard(this.installCommand(token));
    this.toast("Copied the install command");
  }

  protected async replaceToken(client: MspClient) {
    const msp = this.msp();
    if (msp == null) {
      return;
    }
    const hadToken = this.installFor()?.enrollment.token != null;
    if (hadToken) {
      const confirmed = await this.dialogService.openSimpleDialog({
        title: "Replace the install token?",
        content: `Install commands already run on ${client.name}'s computers stop letting new people join. Run the new command there instead.`,
        acceptButtonText: "Replace token",
        type: "warning",
      });
      if (!confirmed) {
        return;
      }
    }
    await this.attempt(async () => {
      const enrollment = await this.mspApi.replaceEnrollment(msp.id, client.id);
      this.installFor.set({ client, enrollment });
      this.toast(hadToken ? "Replaced the install token" : "Created the install command");
    });
  }

  private async reload(mspId: string) {
    this.msp.set(await this.mspApi.get(mspId));
  }

  private async confirmWaiting(mspId: string) {
    const confirmed = await this.mspApi.confirmPending(mspId);
    if (confirmed > 0) {
      this.toast(confirmed === 1 ? "Confirmed 1 member" : `Confirmed ${confirmed} members`);
    }
  }

  private async attempt(action: () => Promise<void>) {
    try {
      await action();
    } catch (e) {
      this.showError(e);
    }
  }

  private toast(message: string) {
    this.toastService.showToast({ variant: "success", message });
  }

  private showError(e: unknown) {
    const message =
      e instanceof ErrorResponse
        ? e.getSingleMessage()
        : e instanceof Error
          ? e.message
          : String(e);
    this.toastService.showToast({ variant: "error", message });
  }
}
