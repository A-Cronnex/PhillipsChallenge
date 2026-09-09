"use strict";

import { Platform } from "react-native";
import { TurboModuleRegistry } from "react-native";
const imagesModule = Platform.OS === "ios" ? TurboModuleRegistry.getEnforcing("MLRNImagesModule") : null;
export default imagesModule;
//# sourceMappingURL=NativeImagesModule.js.map