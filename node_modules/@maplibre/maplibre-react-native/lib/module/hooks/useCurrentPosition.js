"use strict";

import { useCallback, useEffect, useState } from "react";
import { LocationManager } from "../modules/location/LocationManager.js";
export function useCurrentPosition({
  enabled = true,
  minDisplacement
} = {}) {
  const [currentPosition, setCurrentPosition] = useState();
  useEffect(() => {
    if (minDisplacement !== undefined) {
      LocationManager.setMinDisplacement(minDisplacement);
    }
  }, [minDisplacement]);
  const handleUpdate = useCallback(position => {
    setCurrentPosition(position);
  }, []);
  useEffect(() => {
    if (enabled) {
      LocationManager.addListener(handleUpdate);
    }
    return () => {
      if (enabled) {
        LocationManager.removeListener(handleUpdate);
      }
    };
  }, [enabled, handleUpdate]);
  return currentPosition;
}
//# sourceMappingURL=useCurrentPosition.js.map