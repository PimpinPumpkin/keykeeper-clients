import { ChangeDetectionStrategy, Component, OnInit } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";

import { CipherType } from "@bitwarden/common/vault/enums";
import { FormFieldModule } from "@bitwarden/components";

import { CipherFormContainer } from "../cipher-form/cipher-form-container";

import { setStoredExpiration, storedExpiration } from "./expiration";

/**
 * Keykeeper: the "Expires" date in the item editor. Cards use their own expiry
 * month, so they don't get this field. Only `keykeeper.expires` is touched.
 */
@Component({
  selector: "vault-keykeeper-expiration-field",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FormFieldModule],
  template: `
    @if (!isCard) {
      <bit-form-field [formGroup]="form">
        <bit-label>Expires</bit-label>
        <input bitInput type="date" formControlName="expires" data-testid="keykeeper-expires" />
        <bit-hint>Leave empty if it never expires.</bit-hint>
      </bit-form-field>
    }
  `,
})
export class KeykeeperExpirationFieldComponent implements OnInit {
  protected readonly form = this.formBuilder.group({ expires: [""] });

  constructor(
    private readonly cipherFormContainer: CipherFormContainer,
    private readonly formBuilder: FormBuilder,
  ) {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(({ expires }) => {
      this.cipherFormContainer.patchCipher((cipher) => {
        setStoredExpiration(cipher, expires || null);
        return cipher;
      });
    });
  }

  protected get isCard(): boolean {
    return this.cipherFormContainer.config.cipherType === CipherType.Card;
  }

  ngOnInit() {
    const initial = this.cipherFormContainer.getInitialCipherView();
    this.form.patchValue({ expires: storedExpiration(initial ?? {}) ?? "" }, { emitEvent: false });
    if (this.cipherFormContainer.config.mode === "partial-edit") {
      this.form.disable({ emitEvent: false });
    }
  }
}
