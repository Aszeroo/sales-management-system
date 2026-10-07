import Swal from 'sweetalert2';

export interface SubmitFormOptions {
  setLoading: (loading: boolean) => void;
  /** Called after a successful save (close the modal, reload the list). */
  onSuccess: () => void;
  /** Toast body after success; the entity forms keep it empty. */
  successMessage?: string;
  /**
   * Maps the raw error message to the toast body. Entity forms show an
   * empty body; the users page maps admin-RPC error text to i18n.
   */
  describeError?: (message: string) => string;
}

/**
 * The error toast body: entity forms show an empty body; the users page
 * maps admin-RPC error text to i18n.
 */
function describeError(
  options: SubmitFormOptions,
  message: string,
): string {
  return options.describeError ? options.describeError(message) : '';
}

/**
 * The shared save flow of every form modal (issue #8): loading state,
 * success toast, error toast, and the onSuccess handoff — written once
 * here instead of once per modal.
 */
export async function submitForm(
  t: (key: string, opts?: Record<string, unknown>) => string,
  action: () => Promise<unknown>,
  options: SubmitFormOptions,
): Promise<void> {
  options.setLoading(true);
  try {
    await action();
    Swal.fire(t('common.success'), options.successMessage ?? '', 'success');
    options.onSuccess();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Swal.fire(t('common.error'), describeError(options, message), 'error');
  } finally {
    options.setLoading(false);
  }
}
