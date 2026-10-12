/**
 * The operation an AppSync Lambda resolver was invoked for.
 *
 * A function behind `a.handler.function` receives the payload of the
 * generated request template: `{ typeName, fieldName, arguments, identity,
 * source, request, prev }`, with `fieldName` at the top. The aws-lambda
 * `AppSyncResolverEvent` type describes a direct resolver instead, with the
 * name under `info`, so code written to that type reads `event.info.fieldName`
 * and fails at run time ("Cannot read properties of undefined (reading
 * 'fieldName')") although it typechecks and passes synth. Accept both.
 */
export interface OperationEvent {
  fieldName?: string;
  info?: { fieldName?: string } | null;
}

export function operationName(event: OperationEvent): string {
  return event.fieldName ?? event.info?.fieldName ?? "";
}
