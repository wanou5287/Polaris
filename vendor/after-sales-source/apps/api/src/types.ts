import type { ActivationQueryResult, WarrantyQueryResponse } from "@warranty/shared";

export type DecisionContext = {
  activation: ActivationQueryResult;
  response: WarrantyQueryResponse;
};
