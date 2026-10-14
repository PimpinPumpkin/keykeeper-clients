import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";

import { CalloutModule } from "@bitwarden/components";

import { templateDefinition } from "./templates";

/** Keykeeper: explains, in the item editor, that the item is a custom template. */
@Component({
  selector: "vault-keykeeper-template-hint",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CalloutModule],
  template: `
    @if (definition(); as d) {
      <bit-callout type="info" [title]="null" data-testid="keykeeper-template-hint">
        This is a template for new {{ d.base === "login" ? "logins" : "notes" }}. Its name is the
        template's name, and new items start with its custom fields. Values you enter here become
        defaults.
      </bit-callout>
    }
  `,
})
export class KeykeeperTemplateHintComponent {
  readonly fields = input<{ name?: string | null; value?: string | null }[] | null | undefined>(
    null,
  );

  protected readonly definition = computed(() => templateDefinition({ fields: this.fields() }));
}
