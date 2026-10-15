import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  input,
  output,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, FormControl } from "@angular/forms";

import { SharedModule } from "../../shared";

import { TechnicianAccess } from "./msp-api.service";
import { DEFAULT_ACCESS, NO_PERMISSIONS, PERMISSIONS } from "./technician-access";

/**
 * Keykeeper: what an MSP technician gets in the MSP's clients. Every client or
 * chosen ones, admin or a custom role inside them (with or without vault
 * items), and whether they see install commands. Emits the access on every
 * change, starting from the one it was given; the parent saves it.
 */
@Component({
  selector: "app-keykeeper-technician-access",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedModule],
  template: `
    <div [formGroup]="form" class="tw-flex tw-flex-col tw-gap-2">
      <bit-radio-group formControlName="scope" [block]="true">
        <bit-label>Clients</bit-label>
        <bit-radio-button value="all">
          <bit-label>Every client</bit-label>
          <bit-hint>Including clients added later.</bit-hint>
        </bit-radio-button>
        <bit-radio-button value="chosen">
          <bit-label>Only the clients chosen here</bit-label>
        </bit-radio-button>
      </bit-radio-group>
      @if (form.controls.scope.value === "chosen") {
        <div class="tw-mb-2 tw-ml-6" formGroupName="clients">
          @for (client of clients(); track client.id) {
            <bit-form-control>
              <input type="checkbox" bitCheckbox [formControlName]="client.id" />
              <bit-label>{{ client.name }}</bit-label>
            </bit-form-control>
          } @empty {
            <p bitTypography="helper">No clients yet.</p>
          }
        </div>
      }

      <bit-radio-group formControlName="role" [block]="true">
        <bit-label>Role in those clients</bit-label>
        <bit-radio-button value="admin">
          <bit-label>Admin</bit-label>
          <bit-hint>Manages everything in the client and sees every vault item.</bit-hint>
        </bit-radio-button>
        <bit-radio-button value="custom">
          <bit-label>Custom</bit-label>
          <bit-hint>Only the permissions chosen here, and only for regular members.</bit-hint>
        </bit-radio-button>
      </bit-radio-group>
      @if (form.controls.role.value === "custom") {
        <div class="tw-mb-2 tw-ml-6">
          <div formGroupName="permissions">
            @for (p of permissions; track p.key) {
              <bit-form-control>
                <input type="checkbox" bitCheckbox [formControlName]="p.key" />
                <bit-label>{{ p.label | i18n }}</bit-label>
              </bit-form-control>
            }
          </div>
          <bit-form-control>
            <input type="checkbox" bitCheckbox formControlName="vaultItems" />
            <bit-label>Sees and edits every vault item</bit-label>
            <bit-hint>
              In their own vault. Otherwise they see only collections the client shares with them.
            </bit-hint>
          </bit-form-control>
        </div>
      }

      <bit-form-control>
        <input type="checkbox" bitCheckbox formControlName="installCommands" />
        <bit-label>Sees install commands</bit-label>
        <bit-hint>
          The RMM install command of each client they reach. Anyone who has one can ask to join.
        </bit-hint>
      </bit-form-control>
    </div>
  `,
})
export class KeykeeperTechnicianAccessEditorComponent implements OnInit {
  /** The MSP's clients to choose from. */
  readonly clients = input.required<{ id: string; name: string }[]>();
  /** The access to start from. */
  readonly access = input<TechnicianAccess>(DEFAULT_ACCESS);
  readonly accessChange = output<TechnicianAccess>();

  protected readonly permissions = PERMISSIONS;
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly form = this.formBuilder.nonNullable.group({
    scope: ["all" as "all" | "chosen"],
    clients: this.formBuilder.nonNullable.record<boolean>({}),
    role: ["admin" as "admin" | "custom"],
    permissions: this.formBuilder.nonNullable.group({ ...NO_PERMISSIONS }),
    vaultItems: [false],
    installCommands: [true],
  });

  ngOnInit() {
    const access = this.access();
    for (const client of this.clients()) {
      this.form.controls.clients.addControl(
        client.id,
        new FormControl(access.clients.includes(client.id), { nonNullable: true }),
      );
    }
    this.form.patchValue({
      scope: access.allClients ? "all" : "chosen",
      role: access.custom == null ? "admin" : "custom",
      permissions: access.custom?.permissions ?? NO_PERMISSIONS,
      vaultItems: access.custom?.vaultItems ?? false,
      installCommands: access.installCommands,
    });
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.accessChange.emit(this.value()));
  }

  private value(): TechnicianAccess {
    const v = this.form.getRawValue();
    const allClients = v.scope === "all";
    return {
      allClients,
      clients: allClients
        ? []
        : Object.entries(v.clients)
            .filter(([, chosen]) => chosen)
            .map(([id]) => id),
      custom:
        v.role === "custom"
          ? { permissions: { ...NO_PERMISSIONS, ...v.permissions }, vaultItems: v.vaultItems }
          : null,
      installCommands: v.installCommands,
    };
  }
}
