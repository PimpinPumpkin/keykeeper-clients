// Keykeeper: writes an MSP's item templates into its clients. Each copy is an
// ordinary item in the client's Templates collection, encrypted here with that
// client's key by upstream's own code, with the same template id as the source
// and the MSP's name in its definition. The server only records which item
// each copy is and which version of the source it was made from. See
// DESIGN.md, "MSP templates".

import { Injectable } from "@angular/core";
import { firstValueFrom } from "rxjs";

import { CollectionAdminService } from "@bitwarden/admin-console/common";
import { CollectionAdminView } from "@bitwarden/common/admin-console/models/collections";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { getUserId } from "@bitwarden/common/auth/services/account.service";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";
import { SyncService } from "@bitwarden/common/platform/sync";
import { CollectionId, OrganizationId, UserId } from "@bitwarden/common/types/guid";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherType, SecureNoteType } from "@bitwarden/common/vault/enums";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { FieldView } from "@bitwarden/common/vault/models/view/field.view";
import { SecureNoteView } from "@bitwarden/common/vault/models/view/secure-note.view";
import {
  newTemplateDefinitionField,
  TEMPLATE_DEFINITION_FIELD_NAME,
  templateDefinition,
} from "@bitwarden/vault";

import { KeykeeperMspApiService, MspTemplates, TemplateCopy } from "./msp-api.service";

type NamedClient = { id: string; name: string };

export type SendResult = {
  sent: NamedClient[];
  failed: (NamedClient & { error: string })[];
};

@Injectable({ providedIn: "root" })
export class KeykeeperTemplateSender {
  constructor(
    private readonly mspApi: KeykeeperMspApiService,
    private readonly cipherService: CipherService,
    private readonly collectionAdminService: CollectionAdminService,
    private readonly accountService: AccountService,
    private readonly syncService: SyncService,
  ) {}

  /**
   * Writes the source's current version into each client, replacing an older
   * copy, and records the copies. A client that fails is reported, and the
   * others still get it.
   */
  async send(
    msp: { id: string; name: string },
    source: CipherView,
    clients: NamedClient[],
    state: MspTemplates,
  ): Promise<SendResult> {
    const definition = templateDefinition(source);
    if (definition == null) {
      throw new Error("That item isn't a template.");
    }
    const userId = await firstValueFrom(this.accountService.activeAccount$.pipe(getUserId));
    const items = new Map(
      (await this.cipherService.getAllDecrypted(userId)).map((c) => [c.id, c] as const),
    );
    const revision = source.revisionDate.toISOString();
    const result: SendResult = { sent: [], failed: [] };
    const copies: TemplateCopy[] = [];
    for (const client of clients) {
      try {
        const recorded = state.copies.find(
          (c) => c.organizationId === client.id && c.templateId === definition.id,
        );
        const existing = recorded ? items.get(recorded.cipherId) : undefined;
        const live =
          existing != null && !existing.isDeleted && existing.organizationId === client.id
            ? existing
            : undefined;
        const copy = live ?? new CipherView();
        copy.type = CipherType.SecureNote;
        copy.secureNote = new SecureNoteView();
        copy.secureNote.type = SecureNoteType.Generic;
        copy.name = source.name;
        copy.notes = source.notes;
        copy.fields = [
          ...source.fields
            .filter((f) => f.name !== TEMPLATE_DEFINITION_FIELD_NAME)
            .map((f) => {
              const field = new FieldView();
              field.name = f.name;
              field.value = f.value;
              field.type = f.type;
              return field;
            }),
          newTemplateDefinitionField(definition.base, definition.id, msp.name),
        ];
        let saved: CipherView;
        if (live) {
          saved = await this.cipherService.updateWithServer(copy, userId, undefined, true);
        } else {
          copy.organizationId = client.id as OrganizationId;
          copy.collectionIds = [
            (await this.templatesCollection(msp.id, client.id, state, userId)) as CollectionId,
          ];
          saved = await this.cipherService.createWithServer(copy, userId, true);
        }
        copies.push({ organizationId: client.id, cipherId: saved.id, sourceRevision: revision });
        result.sent.push(client);
      } catch (e) {
        result.failed.push({ ...client, error: errorMessage(e) });
      }
    }
    if (copies.length > 0) {
      await this.mspApi.recordTemplateCopies(msp.id, definition.id, copies);
      await this.syncService.fullSync(true);
    }
    return result;
  }

  /** Moves copies to the trash in each client, for when the MSP stops sending a template. */
  async removeCopies(copyIds: string[]): Promise<void> {
    const userId = await firstValueFrom(this.accountService.activeAccount$.pipe(getUserId));
    for (const id of copyIds) {
      await this.cipherService.softDeleteWithServer(id, userId, true);
    }
  }

  /** The client's Templates collection, made the first time and whenever the client deleted it. */
  private async templatesCollection(
    mspId: string,
    orgId: string,
    state: MspTemplates,
    userId: UserId,
  ): Promise<string> {
    const recorded = state.collections[orgId];
    if (recorded != null) {
      const collections = await firstValueFrom(
        this.collectionAdminService.collectionAdminViews$(orgId, userId),
      );
      if (collections.some((c) => c.id === recorded)) {
        return recorded;
      }
    }
    const view = new CollectionAdminView({
      id: undefined as unknown as CollectionId,
      organizationId: orgId as OrganizationId,
      name: "Templates",
    });
    const created = await this.collectionAdminService.create(view, userId);
    await this.mspApi.setTemplatesCollection(mspId, orgId, created.id);
    state.collections[orgId] = created.id;
    return created.id;
  }
}

function errorMessage(e: unknown): string {
  return e instanceof ErrorResponse
    ? e.getSingleMessage()
    : e instanceof Error
      ? e.message
      : String(e);
}
