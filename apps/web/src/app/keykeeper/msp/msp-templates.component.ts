import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from "@angular/core";
import { FormBuilder, FormControl, FormGroup } from "@angular/forms";
import { firstValueFrom } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { getUserId } from "@bitwarden/common/auth/services/account.service";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { DialogService, ToastService } from "@bitwarden/components";
import { customTemplate, templateDefinition } from "@bitwarden/vault";

import { SharedModule } from "../../shared";

import { KeykeeperMspApiService, MspClient, MspDetails, MspTemplates } from "./msp-api.service";
import { clientList } from "./msp-policies";
import { KeykeeperTemplateSender, SendResult } from "./msp-template-sender.service";
import {
  KnownItem,
  TemplateRow,
  templateRows,
  templateStatus,
  templateTargets,
} from "./msp-templates";

const CONFIRMED = 2;

/**
 * Keykeeper: the item templates an MSP sends to its clients. MSP admins pick
 * a template they can see and send it to every client (including clients
 * added later) or chosen ones; the console writes encrypted copies into each
 * client's Templates collection and shows which clients need an update after
 * the source changes. See DESIGN.md, "MSP templates".
 */
@Component({
  selector: "app-keykeeper-msp-templates",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedModule],
  template: `
    <section class="tw-mb-8" aria-label="Templates" data-testid="msp-templates">
      <h2 bitTypography="h3">Templates</h2>
      <p bitTypography="body2">
        Item templates your clients get, in each client's Templates collection. A template for every
        client also goes to clients you add later. To change a template, edit it where you made it,
        then update your clients here.
      </p>
      @if (rows().length === 0) {
        <p bitTypography="body2" class="tw-text-muted">No templates sent yet.</p>
      } @else {
        <bit-table>
          <ng-container header>
            <tr>
              <th bitCell>Template</th>
              <th bitCell>Clients</th>
              <th bitCell>Status</th>
              <th bitCell></th>
            </tr>
          </ng-container>
          <ng-template body>
            @for (row of rows(); track row.templateId) {
              @let name = row.name ?? "A template you can't see";
              <tr bitRow [attr.data-testid]="'msp-template-' + name">
                <td bitCell>{{ name }}</td>
                <td bitCell>{{ targets(row) }}</td>
                <td bitCell data-testid="msp-template-status">{{ status(row) }}</td>
                <td bitCell class="tw-whitespace-nowrap tw-text-right">
                  @if (isAdmin()) {
                    @if (row.sourceVisible && row.behind.length > 0) {
                      <button type="button" bitLink class="tw-mr-3" (click)="update(row)">
                        Update
                        {{ row.behind.length === 1 ? "1 client" : row.behind.length + " clients" }}
                      </button>
                    }
                    <button
                      type="button"
                      bitLink
                      [attr.aria-label]="'Stop sending ' + name"
                      (click)="stop(row)"
                    >
                      Stop
                    </button>
                  }
                </td>
              </tr>
            }
          </ng-template>
        </bit-table>
      }

      @if (isAdmin()) {
        <form
          [formGroup]="form"
          [bitSubmit]="send"
          class="tw-mt-4 tw-rounded-lg tw-border tw-border-solid tw-border-secondary-300 tw-p-4"
          aria-label="Send a template"
        >
          <h3 bitTypography="h5">Send a template</h3>
          @if (candidates().length === 0) {
            <p bitTypography="body2" class="tw-mb-0">
              Make a template first: in your vault, choose New, then From template, then Create
              template.
            </p>
          } @else {
            <bit-form-field>
              <bit-label>Template</bit-label>
              <select bitInput formControlName="source">
                @for (c of candidates(); track c.id) {
                  <option [value]="c.id">{{ c.name }}</option>
                }
              </select>
              <bit-hint
                >Your own templates and your organizations', never a client's copy.</bit-hint
              >
            </bit-form-field>
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
              <div class="tw-mb-2 tw-ml-6" [formGroup]="chosen()">
                @for (client of msp().clients; track client.id) {
                  <bit-form-control>
                    <input type="checkbox" bitCheckbox [formControlName]="client.id" />
                    <bit-label>{{ client.name }}</bit-label>
                  </bit-form-control>
                }
              </div>
            }
            <button bitButton bitFormButton buttonType="primary" type="submit">Send</button>
          }
        </form>
      }
    </section>
  `,
})
export class KeykeeperMspTemplatesComponent {
  readonly msp = input.required<MspDetails>();
  readonly templates = input.required<MspTemplates>();
  /** Templates or copies changed. */
  readonly changed = output<void>();

  /** The items the person can decrypt: sources, copies, and templates to choose from. */
  private readonly items = signal<CipherView[]>([]);

  protected readonly isAdmin = computed(() => this.msp().role === "admin");

  protected readonly rows = computed(() =>
    templateRows(
      this.templates(),
      this.msp().clients.map(({ id, name }) => ({ id, name })),
      new Map(
        this.items().map((c): [string, KnownItem] => [
          c.id,
          {
            name: c.name,
            revision: c.revisionDate.toISOString(),
            deleted: c.isDeleted,
            organizationId: c.organizationId ?? null,
          },
        ]),
      ),
    ),
  );

  /** Templates an admin can send: their own and their organizations', never a client's copy. */
  protected readonly candidates = computed(() => {
    const clients = new Set(this.msp().clients.map((c) => c.id));
    return this.items()
      .filter(
        (c) =>
          customTemplate(c) != null && !(c.organizationId != null && clients.has(c.organizationId)),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  protected readonly form = this.formBuilder.group({
    source: [""],
    scope: ["all" as "all" | "chosen"],
  });
  /** A checkbox per client, for "Only the clients chosen here". */
  protected readonly chosen = signal(
    new FormGroup<Record<string, FormControl<boolean | null>>>({}),
  );

  constructor(
    private readonly formBuilder: FormBuilder,
    private readonly mspApi: KeykeeperMspApiService,
    private readonly sender: KeykeeperTemplateSender,
    private readonly cipherService: CipherService,
    private readonly accountService: AccountService,
    private readonly dialogService: DialogService,
    private readonly toastService: ToastService,
  ) {
    // Reload what the person can decrypt whenever the templates change.
    effect(() => {
      this.templates();
      void this.loadItems();
    });
    effect(() => {
      const ids = this.msp().clients.map((c) => c.id);
      this.chosen.set(
        new FormGroup(
          Object.fromEntries(ids.map((id) => [id, new FormControl<boolean | null>(false)])),
        ),
      );
    });
    effect(() => {
      const candidates = this.candidates();
      if (!candidates.some((c) => c.id === this.form.controls.source.value)) {
        this.form.controls.source.setValue(candidates[0]?.id ?? "");
      }
    });
  }

  protected targets(row: TemplateRow) {
    return templateTargets(row);
  }

  protected status(row: TemplateRow) {
    return templateStatus(row);
  }

  private async loadItems() {
    const userId = await firstValueFrom(this.accountService.activeAccount$.pipe(getUserId));
    this.items.set(await this.cipherService.getAllDecrypted(userId));
  }

  /** Clients whose key the person holds, so a copy can be encrypted for them. */
  private keyed(clients: { id: string; name: string }[]) {
    const confirmed = new Set(
      this.msp()
        .clients.filter((c: MspClient) => c.you?.status === CONFIRMED)
        .map((c) => c.id),
    );
    return clients.filter((c) => confirmed.has(c.id));
  }

  protected readonly send = async () => {
    const source = this.items().find((c) => c.id === this.form.controls.source.value);
    const definition = templateDefinition(source);
    if (source == null || definition == null) {
      return;
    }
    const allClients = this.form.controls.scope.value === "all";
    const chosen = allClients
      ? []
      : Object.entries(this.chosen().value)
          .filter(([, on]) => on)
          .map(([id]) => id);
    if (!allClients && chosen.length === 0) {
      this.toast("error", "Choose at least one client.");
      return;
    }
    await this.attempt(async () => {
      const m = this.msp();
      await this.mspApi.setTemplate(m.id, definition.id, {
        sourceCipherId: source.id,
        allClients,
        clients: chosen,
      });
      const targets = m.clients.filter((c) => allClients || chosen.includes(c.id));
      const result = await this.sender.send(
        m,
        source,
        this.keyed(targets),
        await this.mspApi.getTemplates(m.id),
      );
      this.report(source.name, result);
    });
  };

  protected async update(row: TemplateRow) {
    const source = this.items().find((c) => c.id === row.sourceCipherId);
    if (source == null) {
      return;
    }
    await this.attempt(async () => {
      const result = await this.sender.send(
        this.msp(),
        source,
        this.keyed(row.behind),
        this.templates(),
      );
      this.report(source.name, result);
    });
  }

  protected async stop(row: TemplateRow) {
    const name = row.name ?? "this template";
    const stop = await this.dialogService.openSimpleDialog({
      title: `Stop sending ${name}?`,
      content: "Clients you add later won't get it, and its copies won't be updated.",
      acceptButtonText: "Stop sending",
      type: "warning",
    });
    if (!stop) {
      return;
    }
    const copies = this.templates()
      .copies.filter((c) => c.templateId === row.templateId)
      .map((c) => c.cipherId)
      .filter((id) => this.items().some((i) => i.id === id && !i.isDeleted));
    const remove =
      copies.length > 0 &&
      (await this.dialogService.openSimpleDialog({
        title: `Remove its copies too?`,
        content: `${copies.length === 1 ? "1 client has" : copies.length + " clients have"} a copy. Removing moves it to the client's trash; keeping leaves it as that client's template.`,
        acceptButtonText: "Remove copies",
        cancelButtonText: "Keep them",
        type: "warning",
      }));
    await this.attempt(async () => {
      if (remove) {
        await this.sender.removeCopies(copies);
      }
      await this.mspApi.stopTemplate(this.msp().id, row.templateId);
      this.toast("success", `Stopped sending ${name}`);
      this.changed.emit();
    });
  }

  private report(name: string, result: SendResult) {
    const parts = [
      result.sent.length > 0
        ? `Sent ${name} to ${clientList(result.sent)}.`
        : `${name} is saved; no client needed a copy.`,
      ...result.failed.map((f) => `${f.name} failed: ${f.error}`),
    ];
    this.toast(result.failed.length > 0 ? "warning" : "success", parts.join(" "));
    this.changed.emit();
  }

  private async attempt(action: () => Promise<void>) {
    try {
      await action();
    } catch (e) {
      const message =
        e instanceof ErrorResponse
          ? e.getSingleMessage()
          : e instanceof Error
            ? e.message
            : String(e);
      this.toast("error", message);
    }
  }

  private toast(variant: "success" | "warning" | "error", message: string) {
    this.toastService.showToast({ variant, message });
  }
}
