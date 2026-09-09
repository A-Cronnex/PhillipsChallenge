"use strict";

import { useState } from "react";
let generatedIdCounter = 0;
export function useFrozenId(id) {
  const [frozenId] = useState(id ? id : `mlrn-${generatedIdCounter++}`);
  if (id && id !== frozenId) {
    throw new Error("`id` cannot be changed");
  }
  return frozenId;
}
//# sourceMappingURL=useFrozenId.js.map